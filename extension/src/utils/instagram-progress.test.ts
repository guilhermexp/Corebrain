import { describe, expect, it, vi } from 'vitest';
import { createInstagramSyncController } from './instagram-sync';
import { enviarSalvosInstagram, type InstagramSavedPost } from './instagram-saved';
import { fetchBridge } from './bridge-settings';

vi.mock('./bridge-settings', () => ({ fetchBridge: vi.fn() }));

describe('Instagram batch recovery', () => {
	it('restores accumulated counts after a worker restart following the first batch', async () => {
		const posts: InstagramSavedPost[] = Array.from({ length: 101 }, (_, i) => ({
			id: String(i), autor: 'ana', nomeAutor: 'Ana', texto: 'post',
			url: `https://www.instagram.com/p/POST_${i}/`, criadoEm: '', midia: [],
		}));
		let persisted: unknown;
		let finishSecond!: (response: Response) => void;
		vi.mocked(fetchBridge)
			.mockResolvedValueOnce({ ok: true, json: async () => ({ criados: 90, pulados: 7, erros: 3 }) } as Response)
			.mockImplementationOnce(() => new Promise<Response>(resolve => { finishSecond = resolve; }));
		const deps = {
			bridgeAvailable: async () => true,
			fetchSaved: async () => ({ novos: posts, paginas: 1, alcancouFim: true }),
			sendSaved: enviarSalvosInstagram,
			getFolder: async () => 'Clippings',
			loadStatus: async () => persisted,
			saveStatus: async (value: unknown) => { persisted = value; },
		};
		const controller = createInstagramSyncController(deps);
		await controller.start();
		await vi.waitFor(() => expect(persisted).toMatchObject({ phase: 'saving', processed: 100 }));
		try {
			const restarted = createInstagramSyncController(deps);
			expect(await restarted.getStatus()).toMatchObject({
				phase: 'interrupted', processed: 100, total: 101, created: 90, skipped: 7, errors: 3,
			});
		} finally {
			finishSecond({ ok: true, json: async () => ({ criados: 1, pulados: 0, erros: 0 }) } as Response);
			await vi.waitFor(async () => expect((await controller.getStatus()).running).toBe(false));
		}
	});
});
