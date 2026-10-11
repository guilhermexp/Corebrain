import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInstagramSyncController } from './instagram-sync';
import type { InstagramSavedPost, InstagramTransportResult } from './instagram-saved';

const emptyFeed = { novos: [], paginas: 1, alcancouFim: true };
const emptyImport = { criados: 0, pulados: 0, erros: 0 };
const examplePost: InstagramSavedPost = {
	id: '1', autor: 'ana', nomeAutor: 'Ana', texto: 'Post',
	url: 'https://www.instagram.com/p/ABC_1/', criadoEm: '', midia: [],
};

function makeStore(initial?: unknown) {
	let value = initial;
	return {
		load: vi.fn(async () => value),
		save: vi.fn(async (next: unknown) => { value = next; }),
		read: () => value,
	};
}

async function waitForTerminal(controller: ReturnType<typeof createInstagramSyncController>) {
	await vi.waitFor(async () => {
		expect((await controller.getStatus()).running).toBe(false);
	});
}

describe('Instagram saved sync controller', () => {
	afterEach(() => vi.restoreAllMocks());

	it('requires the paired bridge before fetching Instagram', async () => {
		const store = makeStore();
		const buscar = vi.fn(async () => emptyFeed);
		const controller = createInstagramSyncController({
			bridgeAvailable: vi.fn(async () => false),
			fetchSaved: buscar,
			sendSaved: vi.fn(async () => emptyImport),
			getFolder: vi.fn(async () => 'Clippings'),
			loadStatus: store.load,
			saveStatus: store.save,
		});

		await expect(controller.start()).resolves.toMatchObject({ success: true, accepted: true });
		await waitForTerminal(controller);
		expect(buscar).not.toHaveBeenCalled();
		expect(await controller.getStatus()).toMatchObject({
			phase: 'error',
			error: expect.stringMatching(/Corebrain|Obsidian|paread/i),
		});
	});

	it('does not start a second job while the first feed scan is active', async () => {
		const store = makeStore();
		let finishFetch!: (value: typeof emptyFeed) => void;
		const fetchSaved = vi.fn(() => new Promise<typeof emptyFeed>((resolve) => { finishFetch = resolve; }));
		const controller = createInstagramSyncController({
			bridgeAvailable: vi.fn(async () => true),
			fetchSaved,
			sendSaved: vi.fn(async () => emptyImport),
			getFolder: vi.fn(async () => 'Clippings'),
			loadStatus: store.load,
			saveStatus: store.save,
		});

		await expect(controller.start()).resolves.toMatchObject({ success: true, accepted: true });
		await vi.waitFor(() => expect(fetchSaved).toHaveBeenCalledTimes(1));
		await expect(controller.start()).resolves.toMatchObject({ success: false });
		finishFetch(emptyFeed);
		await waitForTerminal(controller);
		expect(fetchSaved).toHaveBeenCalledTimes(1);
	});

	it('keeps cancellation visibly separate from a successful empty import', async () => {
		const store = makeStore();
		let finishSend!: () => void;
		const controller = createInstagramSyncController({
			bridgeAvailable: vi.fn(async () => true),
			fetchSaved: vi.fn(async () => ({ novos: [examplePost], paginas: 1, alcancouFim: true })),
			sendSaved: vi.fn(() => new Promise<InstagramTransportResult>((resolve) => { finishSend = () => resolve({ ...emptyImport, cancelado: true }); })),
			getFolder: vi.fn(async () => 'Clippings'),
			loadStatus: store.load,
			saveStatus: store.save,
		});

		await controller.start();
		await vi.waitFor(() => expect(finishSend).toBeTypeOf('function'));
		await controller.cancel();
		finishSend();
		await waitForTerminal(controller);
		expect(await controller.getStatus()).toMatchObject({ phase: 'cancelled', cancelRequested: true });
	});

	it('does not send an incomplete scan to the bridge', async () => {
		const store = makeStore();
		const sendSaved = vi.fn(async () => emptyImport);
		const controller = createInstagramSyncController({
			bridgeAvailable: vi.fn(async () => true),
			fetchSaved: vi.fn(async () => ({ novos: [examplePost], paginas: 1, alcancouFim: false })),
			sendSaved,
			getFolder: vi.fn(async () => 'Clippings'),
			loadStatus: store.load,
			saveStatus: store.save,
		});

		await controller.start();
		await waitForTerminal(controller);
		expect(sendSaved).not.toHaveBeenCalled();
		expect(await controller.getStatus()).toMatchObject({ phase: 'partial', created: 0, errors: 0 });
	});

	it('retains partial errors when nothing was created', async () => {
		const store = makeStore();
		const controller = createInstagramSyncController({
			bridgeAvailable: vi.fn(async () => true),
			fetchSaved: vi.fn(async () => ({ novos: [examplePost], paginas: 1, alcancouFim: true })),
			sendSaved: vi.fn(async () => ({ criados: 0, pulados: 0, erros: 1, avisos: ['Uma capa falhou'] })),
			getFolder: vi.fn(async () => 'Clippings'),
			loadStatus: store.load,
			saveStatus: store.save,
		});

		await controller.start();
		await waitForTerminal(controller);
		expect(await controller.getStatus()).toMatchObject({
			phase: 'partial',
			created: 0,
			errors: 1,
			warnings: ['Uma capa falhou'],
		});
	});

	it('keeps running status readable when the popup is reopened during the job', async () => {
		const store = makeStore();
		let finishFetch!: (value: typeof emptyFeed) => void;
		const controller = createInstagramSyncController({
			bridgeAvailable: vi.fn(async () => true),
			fetchSaved: vi.fn(() => new Promise<typeof emptyFeed>((resolve) => { finishFetch = resolve; })),
			sendSaved: vi.fn(async () => emptyImport),
			getFolder: vi.fn(async () => 'Clippings'),
			loadStatus: store.load,
			saveStatus: store.save,
		});

		await controller.start();
		await vi.waitFor(async () => expect((await controller.getStatus()).phase).toBe('fetching'));
		expect(await controller.getStatus()).toMatchObject({ running: true, phase: 'fetching' });
		finishFetch(emptyFeed);
		await waitForTerminal(controller);
	});

	it('marks persisted in-flight work as interrupted after a worker restart', async () => {
		const priorStatus = {
			running: true,
			phase: 'saving',
			found: 9,
			created: 4,
			processed: 9,
			total: 9,
			pages: 2,
			skipped: 0,
			errors: 0,
			completeScan: true,
			cancelRequested: false,
			warnings: [],
			updatedAt: 1,
		};
		const store = makeStore(priorStatus);
		const controller = createInstagramSyncController({
			bridgeAvailable: vi.fn(async () => true),
			fetchSaved: vi.fn(async () => emptyFeed),
			sendSaved: vi.fn(async () => emptyImport),
			getFolder: vi.fn(async () => 'Clippings'),
			loadStatus: store.load,
			saveStatus: store.save,
		});

		expect(await controller.getStatus()).toMatchObject({
			running: false,
			phase: 'interrupted',
			created: 4,
			error: expect.stringMatching(/interromp/i),
		});
	});
});
