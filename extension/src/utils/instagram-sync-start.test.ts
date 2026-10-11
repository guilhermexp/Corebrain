import { describe, expect, it, vi } from 'vitest';
import { createInstagramSyncController } from './instagram-sync';
import { startInstagramSyncPinned } from './instagram-sync-start';

const emptyFeed = { novos: [], paginas: 1, alcancouFim: true };
const emptyImport = { criados: 0, pulados: 0, erros: 0 };

describe('startInstagramSyncPinned', () => {
	it('pins the active tab before a slow bridge check, even if focus changes meanwhile', async () => {
		let activeTabId = 41;
		let bridgeReady!: (available: boolean) => void;
		let fetchedFrom: number | undefined;
		const controller = createInstagramSyncController({
			bridgeAvailable: () => new Promise<boolean>((resolve) => { bridgeReady = resolve; }),
			fetchSaved: vi.fn(async (_progress, _cancel, sourceTabId) => {
				fetchedFrom = sourceTabId;
				return emptyFeed;
			}),
			sendSaved: vi.fn(async () => emptyImport),
			getFolder: vi.fn(async () => 'Clippings'),
			loadStatus: vi.fn(async () => undefined),
			saveStatus: vi.fn(async () => undefined),
		});

		const started = await startInstagramSyncPinned(
			undefined,
			undefined,
			async () => activeTabId,
			(tabId) => controller.start(tabId),
		);
		expect(started.success).toBe(true);
		await vi.waitFor(() => expect(bridgeReady).toBeTypeOf('function'));
		activeTabId = 99;
		bridgeReady(true);
		await vi.waitFor(() => expect(fetchedFrom).toBe(41));
		expect((await controller.getStatus()).phase).toBe('complete');
	});

	it('prefers a valid standalone source, then the sender tab, before querying the active tab', async () => {
		const queryActive = vi.fn(async () => 7);
		const start = vi.fn(async (tabId: number) => tabId);

		await expect(startInstagramSyncPinned(55, 41, queryActive, start)).resolves.toBe(55);
		await expect(startInstagramSyncPinned('invalid', 0, queryActive, start)).resolves.toBe(0);
		expect(queryActive).not.toHaveBeenCalled();
		await expect(startInstagramSyncPinned(Number.NaN, undefined, queryActive, start)).resolves.toBe(7);
		expect(queryActive).toHaveBeenCalledTimes(1);
		expect(start.mock.calls.map(([tabId]) => tabId)).toEqual([55, 0, 7]);
	});

	it('rejects when no safe source tab id can be pinned', async () => {
		const start = vi.fn();
		await expect(startInstagramSyncPinned(-1, Number.POSITIVE_INFINITY, async () => undefined, start))
			.rejects.toThrow(/aba.*Instagram|aba.*origem/i);
		expect(start).not.toHaveBeenCalled();
	});
});
