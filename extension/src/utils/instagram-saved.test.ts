import { beforeEach, describe, expect, test, vi } from 'vitest';
const { mockBrowser } = vi.hoisted(() => ({
	mockBrowser: {
		tabs: { query: vi.fn(), get: vi.fn() },
		scripting: { executeScript: vi.fn() },
		storage: { local: { get: vi.fn() } },
	},
}));
vi.mock('./browser-polyfill', () => ({ default: mockBrowser }));
import browser from './browser-polyfill';
import {
	buscarSalvosInstagram,
	enviarSalvosInstagram,
	instagramParaNota,
	type InstagramSavedPost,
} from './instagram-saved';

const saved = (code: string, options: Record<string, unknown> = {}) => ({
	media: {
		pk: `pk-${code}`,
		code,
		media_type: 1,
		user: { username: 'ana', full_name: 'Ana Silva' },
		caption: { text: `Legenda ${code}`, created_at: 1780000000 },
		taken_at: 1780000000,
		image_versions2: { candidates: [{ url: `https://scontent.cdninstagram.com/${code}.jpg`, width: 640, height: 640 }] },
		...options,
	},
});

const apiPayload = (items: unknown[], next: string | null = null, more = !!next) => ({
	status: 'ok',
	items,
	more_available: more,
	...(next ? { next_max_id: next } : {}),
});
const page = (items: unknown[], next: string | null = null, more = !!next) => ({ httpStatus: 200, payload: apiPayload(items, next, more) });
const feedResponse = (payload: unknown, httpStatus = 200) => ({ httpStatus, payload });

const post = (id: string): InstagramSavedPost => ({
	id,
	autor: 'ana',
	nomeAutor: 'Ana Silva',
	texto: `Legenda ${id}`,
	url: `https://www.instagram.com/p/${id}/`,
	criadoEm: '2026-05-28T00:00:00.000Z',
	midia: [`https://scontent.cdninstagram.com/${id}.jpg`],
});

const executeScript = mockBrowser.scripting.executeScript;
let pages: unknown[];

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal('fetch', vi.fn());
	pages = [];
	let pageIndex = 0;
	mockBrowser.tabs.query.mockResolvedValue([
		{ id: 41, url: 'https://www.instagram.com/saved/all-posts/' },
	]);
	mockBrowser.scripting.executeScript.mockImplementation(async () => {
		const result = pages[Math.min(pageIndex++, pages.length - 1)];
		return [{ frameId: 0, result }] as any;
	});
	mockBrowser.storage.local.get.mockResolvedValue({
		corebrain_bridge_port: 27125,
		corebrain_bridge_token: 'paired-token',
	} as any);
});

describe('buscarSalvosInstagram', () => {
	test('uses the source Instagram tab when the independent extension window is focused', async () => {
		mockBrowser.tabs.query.mockResolvedValue([{ id: 99, url: 'chrome-extension://id/popup.html' }]);
		mockBrowser.tabs.get.mockResolvedValue({ id: 41, url: 'https://www.instagram.com/' });
		pages = [page([saved('SOURCE_1')])];
		const result = await buscarSalvosInstagram(undefined, undefined, 41);
		expect(result.novos[0].id).toBe('SOURCE_1');
		expect(executeScript.mock.calls[0][0].target.tabId).toBe(41);
	});
	test('rejects a supplied tab that is not Instagram', async () => {
		mockBrowser.tabs.get.mockResolvedValue({ id: 41, url: 'https://example.com/' });
		await expect(buscarSalvosInstagram(undefined, undefined, 41)).rejects.toThrow(/Instagram/);
		expect(executeScript).not.toHaveBeenCalled();
	});

	test('reads saved posts from the active logged-in Instagram tab, normalizes wrappers and deduplicates IDs', async () => {
		pages = [
			page([saved('A_1'), saved('B_2')], 'cursor-1'),
			page([saved('B_2'), saved('C_3')]),
		];

		const result = await buscarSalvosInstagram();

		expect(result).toMatchObject({ paginas: 2, alcancouFim: true });
		expect(result.novos.map((item) => item.id)).toEqual(['A_1', 'B_2', 'C_3']);
		expect(result.novos[0]).toMatchObject({
			autor: 'ana',
			nomeAutor: 'Ana Silva',
			texto: 'Legenda A_1',
			url: 'https://www.instagram.com/p/A_1/',
			criadoEm: '2026-05-28T20:26:40.000Z',
			midia: ['https://scontent.cdninstagram.com/A_1.jpg'],
		});
		expect(executeScript).toHaveBeenCalledTimes(2);
		expect(executeScript.mock.calls[0][0]).toMatchObject({ target: { tabId: 41 } });
	});

	test('runs a self-contained same-origin GET in the tab and keeps csrf out of the returned result', async () => {
		vi.stubGlobal('location', new URL('https://www.instagram.com/saved/all-posts/'));
		vi.stubGlobal('document', { cookie: 'csrftoken=csrf-secret; sessionid=session-secret' });
		const fetcher = vi.fn(async (_url: string, _init: RequestInit) => ({
			ok: true,
			status: 200,
			json: async () => apiPayload([saved('SAFE_1')]),
		}) as Response);
		vi.stubGlobal('fetch', fetcher);
		mockBrowser.scripting.executeScript.mockImplementation(async (details: any) => [
			{ frameId: 0, result: await details.func(...(details.args || [])) },
		]);

		const result = await buscarSalvosInstagram();

		const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://www.instagram.com/api/v1/feed/saved/posts/');
		expect(init.credentials).toBe('include');
		expect(new Headers(init.headers).get('x-csrftoken')).toBe('csrf-secret');
		expect(result.novos[0].id).toBe('SAFE_1');
		expect(JSON.stringify(result)).not.toContain('csrf-secret');
		expect(JSON.stringify(result)).not.toContain('session-secret');
	});

	test('selects only one best CDN image per carousel item and rejects lookalike hosts', async () => {
		pages = [page([saved('CAROUSEL_1', {
			carousel_media: [
				{ image_versions2: { candidates: [
					{ url: 'https://scontent.cdninstagram.com/slide-small.jpg', width: 80, height: 80 },
					{ url: 'https://scontent.cdninstagram.com/slide-large.jpg', width: 800, height: 800 },
				] } },
				{ image_versions2: { candidates: [{ url: 'https://cdninstagram.com/slide-2.jpg', width: 100, height: 100 }] } },
				{ image_versions2: { candidates: [{ url: 'https://cdninstagram.com.evil.example/evil.jpg', width: 5000, height: 5000 }] } },
			],
		})])];
		const [result] = (await buscarSalvosInstagram()).novos;
		expect(result.midia).toEqual([
			'https://scontent.cdninstagram.com/slide-large.jpg',
			'https://cdninstagram.com/slide-2.jpg',
		]);
	});

	test('rejects when there is no active Instagram tab instead of opening another tab', async () => {
		mockBrowser.tabs.query.mockResolvedValue([{ id: 42, url: 'https://example.com/' }]);
		await expect(buscarSalvosInstagram()).rejects.toThrow(/aba.*Instagram/i);
		expect(executeScript).not.toHaveBeenCalled();
	});

	test('rejects login/challenge responses and malformed feed data rather than reporting a complete scan', async () => {
		pages = [feedResponse({ status: 'fail', message: 'login_required' })];
		await expect(buscarSalvosInstagram()).rejects.toThrow(/sess[aã]o|login/i);

		pages = [feedResponse({ status: 'ok', items: 'not-an-array', more_available: false })];
		await expect(buscarSalvosInstagram()).rejects.toThrow(/formato|feed/i);
	});

	test('reports 429 and cursor cycles as failures, never as end-of-feed', async () => {
		pages = [feedResponse(null, 429)];
		await expect(buscarSalvosInstagram()).rejects.toThrow(/429|limitou/i);

		pages = [page([saved('A_1')], 'repeat'), page([saved('B_2')], 'repeat')];
		await expect(buscarSalvosInstagram()).rejects.toThrow(/cursor|pagina[cç][aã]o|ciclo/i);
	});

	test('returns a visible incomplete result when canceled between pages', async () => {
		pages = [page([saved('A_1')], 'cursor-1'), page([saved('B_2')], 'cursor-2')];
		const deveCancelar = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);

		const result = await buscarSalvosInstagram(undefined, deveCancelar);

		expect(result).toMatchObject({ paginas: 1, alcancouFim: false });
		expect(result.novos.map((item) => item.id)).toEqual(['A_1']);
		expect(executeScript).toHaveBeenCalledTimes(1);
	});
});

describe('instagramParaNota', () => {
	const base = post('ABC_12');

	test('creates a stable source URL, safe YAML and publication metadata without changing arrival date', () => {
		const converted = instagramParaNota({
			...base,
			texto: 'Linha 1\nEla disse "olá"',
			nomeAutor: 'Ana "A" Silva',
		});

		expect(converted.source).toBe('https://www.instagram.com/p/ABC_12/');
		expect(converted.conteudo).toContain('source: "https://www.instagram.com/p/ABC_12/"');
		expect(converted.conteudo).toContain('published: 2026-05-28');
		expect(converted.conteudo).not.toMatch(/^created:/m);
		expect(converted.conteudo).toContain('- "Ana \\"A\\" Silva"');
		const description = converted.conteudo.split('\n').find((line) => line.startsWith('description:'))!;
		expect(JSON.parse(description.slice('description: '.length))).toBe('Linha 1\nEla disse "olá"');
		expect(converted.conteudo).toContain('![](https://scontent.cdninstagram.com/ABC_12.jpg)');
	});

	test('normalizes unsafe/long filenames and does not serialize direct video binaries', () => {
		const converted = instagramParaNota({
			...base,
			texto: 'a/b:c*d?e"f<g>h|i'.repeat(30),
			midia: ['https://scontent.cdninstagram.com/cover.jpg'],
		});
		expect(converted.nome).not.toMatch(/[\\/:*?"<>|#\[\]^]/);
		expect(converted.nome.length).toBeLessThanOrEqual(120);
		expect(converted.conteudo).not.toContain('video_versions');
	});
});

describe('enviarSalvosInstagram', () => {
	test('sends oldest chunks first, keeps each chunk newest-first, and uses the authenticated Instagram route', async () => {
		const batches: any[] = [];
		vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
			batches.push({ url, body: JSON.parse(String(init.body)), authorization: new Headers(init.headers).get('Authorization') });
			const count = JSON.parse(String(init.body)).bookmarks.length;
			return { ok: true, status: 200, json: async () => ({ criados: count, pulados: 0, erros: 0 }) } as Response;
		}));
		const posts = Array.from({ length: 205 }, (_, index) => post(`ID_${index}`)); // newest -> oldest

		const result = await enviarSalvosInstagram(posts);

		expect(result).toMatchObject({ criados: 205, pulados: 0, erros: 0 });
		expect(batches).toHaveLength(3);
		expect(batches.map((batch) => batch.url)).toEqual(Array(3).fill('http://127.0.0.1:27125/instagram-saved'));
		expect(batches.map((batch) => batch.body.bookmarks.length)).toEqual([100, 100, 5]);
		expect(batches[0].body.bookmarks[0].source).toBe('https://www.instagram.com/p/ID_105/');
		expect(batches[0].body.bookmarks[99].source).toBe('https://www.instagram.com/p/ID_204/');
		expect(batches[1].body.bookmarks[0].source).toBe('https://www.instagram.com/p/ID_5/');
		expect(batches[2].body.bookmarks[0].source).toBe('https://www.instagram.com/p/ID_0/');
		expect(batches.every((batch) => batch.body.pasta === 'Clippings')).toBe(true);
		expect(batches.every((batch) => batch.authorization === 'Bearer paired-token')).toBe(true);
	});

	test('makes cancellation and malformed bridge counts visible as partial results', async () => {
		let calls = 0;
		vi.stubGlobal('fetch', vi.fn(async () => {
			calls++;
			return { ok: true, status: 200, json: async () => ({ criados: 100, pulados: 0, erros: 0 }) } as Response;
		}));
		const shouldCancel = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
		const result = await enviarSalvosInstagram(Array.from({ length: 201 }, (_, i) => post(`ID_${i}`)), undefined, undefined, shouldCancel);
		expect(result).toMatchObject({ criados: 100, erros: 0, cancelado: true });
		expect(result.avisos?.join(' ')).toMatch(/101/);
		expect(calls).toBe(1);

		vi.stubGlobal('fetch', vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ criados: 2, pulados: 0, erros: 0 }),
		} as Response)));
		const invalidCounts = await enviarSalvosInstagram([post('BAD')]);
		expect(invalidCounts).toMatchObject({ criados: 0, pulados: 0, erros: 1 });
		expect(invalidCounts.avisos?.length).toBeGreaterThan(0);
	});

	test('records a failed chunk and continues other independent chunks', async () => {
		let call = 0;
		vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
			call++;
			const size = JSON.parse(String(init.body)).bookmarks.length;
			if (call === 1) return { ok: false, status: 500, json: async () => ({}) } as Response;
			return { ok: true, status: 200, json: async () => ({ criados: size, pulados: 0, erros: 0 }) } as Response;
		}));
		const result = await enviarSalvosInstagram(Array.from({ length: 101 }, (_, i) => post(`ID_${i}`)));
		expect(result).toMatchObject({ criados: 1, pulados: 0, erros: 100 });
		expect(result.avisos?.join(' ')).toMatch(/500/);
		expect(call).toBe(2);
	});

	test('propagates safe plugin warnings and updates for an unsupported route', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ criados: 1, pulados: 0, erros: 0, avisos: ['Capa indisponível'] }),
		} as Response)));
		const covered = await enviarSalvosInstagram([post('COVER')]);
		expect(covered).toMatchObject({ criados: 1, avisos: ['Capa indisponível'] });

		vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) } as Response)));
		const outdatedPlugin = await enviarSalvosInstagram([post('OLD_PLUGIN')]);
		expect(outdatedPlugin.erros).toBe(1);
		expect(outdatedPlugin.avisos?.join(' ')).toMatch(/atualize.*plugin Corebrain/i);
	});

	test('times out a stalled bridge request and signals abort', async () => {
		vi.useFakeTimers();
		try {
			const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
				init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
			}));
			vi.stubGlobal('fetch', fetcher);
			const pending = enviarSalvosInstagram([post('SLOW')]);
			await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
			await vi.advanceTimersByTimeAsync(20_000);
			const result = await pending;
			expect(result).toMatchObject({ criados: 0, erros: 1 });
			expect(result.avisos?.length).toBeGreaterThan(0);
			expect((fetcher.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});
