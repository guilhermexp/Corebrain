import { describe, test, expect, beforeEach, vi } from 'vitest';
import browser from './browser-polyfill';
import { buscarBookmarks, bookmarkParaNota, salvarComoNotas, montarUriObsidian, pluginDisponivel, enviarPelaPonte, clipPelaPonte, jaNaGaleria, podeAvancarMarcador, DEFAULT_X_BOOKMARK_FOLDER } from './x-bookmarks';

/**
 * O que importa aqui e a parada incremental e a paginacao: sao um loop com
 * varias saidas, e falham em silencio (sync que rebaixa tudo toda vez, ou que
 * para cedo e perde bookmark). O parse tambem entra, porque o JSON do X e cheio
 * de campo opcional aninhado.
 */

function tweet(id: string, autor = 'alguem', texto = 'oi') {
	return {
		entryId: `tweet-${id}`,
		content: {
			itemContent: {
				tweet_results: {
					result: {
						legacy: {
							id_str: id,
							full_text: texto,
							created_at: 'Sun Aug 02 16:10:04 +0000 2026',
							entities: { urls: [{ expanded_url: 'https://exemplo.com' }] },
							extended_entities: { media: [{ media_url_https: 'https://img/1.jpg' }] },
						},
						core: { user_results: { result: { core: { screen_name: autor, name: 'Nome ' + autor } } } },
					},
				},
			},
		},
	};
}

const cursor = (v: string) => ({ entryId: `cursor-bottom-${v}`, content: { value: v } });

function pagina(entries: unknown[]) {
	return { data: { bookmark_timeline_v2: { timeline: { instructions: [{ entries }] } } } };
}

function mockFetch(paginas: unknown[]) {
	let i = 0;
	return vi.fn(async () => ({
		ok: true,
		status: 200,
		json: async () => paginas[Math.min(i++, paginas.length - 1)],
	})) as unknown as typeof fetch;
}

beforeEach(() => {
	(globalThis as any).chrome = {
		cookies: { get: async ({ name }: { name: string }) => ({ value: name === 'ct0' ? 'csrf' : 'tok' }) },
		storage: { local: { get: async () => ({}), set: async () => undefined } },
	};
});

describe('buscarBookmarks', () => {
	test('pagina ate o fim quando nao ha marcador', async () => {
		globalThis.fetch = mockFetch([
			pagina([tweet('1'), tweet('2'), cursor('c1')]),
			pagina([tweet('3'), cursor('c2')]),
			pagina([]),
		]);
		const r = await buscarBookmarks();
		expect(r.novos.map((b) => b.id)).toEqual(['1', '2', '3']);
		expect(r.alcancouFim).toBe(true);
	});

	test('para no ultimo id conhecido e nao repete o que ja foi salvo', async () => {
		globalThis.fetch = mockFetch([pagina([tweet('9'), tweet('8'), tweet('7'), cursor('c1')])]);
		const r = await buscarBookmarks('8');
		expect(r.novos.map((b) => b.id)).toEqual(['9']); // '8' e o que ja tinhamos; '7' e mais antigo
		expect(r.paginas).toBe(1); // nao pode continuar paginando depois de achar
		expect(r.alcancouFim).toBe(true);
	});

	test('nao entra em loop quando o cursor se repete', async () => {
		globalThis.fetch = mockFetch([pagina([tweet('1'), cursor('mesmo')])]);
		const r = await buscarBookmarks();
		expect(r.paginas).toBe(2); // segunda chamada devolve o mesmo cursor e ele para
		expect(r.alcancouFim).toBe(true);
	});

	test('marks a max-page truncation as incomplete so its cursor is not skipped', async () => {
		globalThis.fetch = mockFetch([pagina([tweet('1'), cursor('next')])]);
		const r = await buscarBookmarks(undefined, undefined, 1);
		expect(r.alcancouFim).toBe(false);
		expect(podeAvancarMarcador(r.novos.length, 1, 0, 0, r.alcancouFim)).toBe(false);
	});

	test('extrai autor, midia e links do JSON aninhado do X', async () => {
		globalThis.fetch = mockFetch([pagina([tweet('42', 'yetone', 'terminal em 2026')]), pagina([])]);
		const [b] = (await buscarBookmarks()).novos;
		expect(b).toMatchObject({
			id: '42',
			autor: 'yetone',
			nomeAutor: 'Nome yetone',
			texto: 'terminal em 2026',
			url: 'https://x.com/yetone/status/42',
			midia: ['https://img/1.jpg'],
			links: ['https://exemplo.com'],
		});
	});

	test('avisa de forma acionavel quando o X rotaciona o queryId', async () => {
		globalThis.fetch = vi.fn(async () => ({
			ok: false,
			status: 404,
			text: async () => 'Operation not found',
		})) as unknown as typeof fetch;
		await expect(buscarBookmarks()).rejects.toThrow(/x\.com\/i\/bookmarks/);
	});

	test('sem sessao, falha explicando o motivo', async () => {
		(globalThis as any).chrome.cookies.get = async () => null;
		await expect(buscarBookmarks()).rejects.toThrow(/sessao do X/i);
	});
});

describe('bookmarkParaNota', () => {
	const base = {
		id: '42', autor: 'yetone', nomeAutor: 'Yetone',
		texto: 'terminal em 2026 https://t.co/abc', url: 'https://x.com/yetone/status/42',
		criadoEm: 'Sun Aug 02 16:10:04 +0000 2026',
		midia: ['https://img/1.jpg'], links: ['https://exemplo.com'],
	};

	test('gera frontmatter que a galeria consegue ler', () => {
		const { conteudo } = bookmarkParaNota(base);
		expect(conteudo).toMatch(/^---\n/);
		expect(conteudo).toContain('source: "https://x.com/yetone/status/42"');
		expect(conteudo).toContain('image: "https://img/1.jpg"'); // e o que vira capa
		expect(conteudo).toContain('created: 2026-08-02');
		expect(conteudo).toContain('- "x-bookmark"');
	});

	test('author sai como texto puro, sem wikilink', () => {
		// [[Fulano]] cria uma nota fantasma por autor: no vault viraram 1163 nos
		// no grafo que nao existem como nota nenhuma.
		const { conteudo } = bookmarkParaNota(base);
		expect(conteudo).toContain('author:\n  - "Yetone"');
		expect(conteudo).not.toContain('[[');
	});

	test('aspas no nome do autor nao quebram o YAML', () => {
		// era o unico campo interpolado cru, sem passar pelo y()
		const { conteudo } = bookmarkParaNota({ ...base, nomeAutor: 'O "Cara" \\ da Silva' });
		const linha = conteudo.split('\n').find((l) => l.startsWith('  - '))!;
		expect(() => JSON.parse(linha.slice('  - '.length))).not.toThrow();
		expect(JSON.parse(linha.slice('  - '.length))).toBe('O "Cara" \\ da Silva');
	});

	test('tira o encurtador t.co do texto', () => {
		expect(bookmarkParaNota(base).conteudo).not.toContain('t.co/abc');
	});

	test('nome do arquivo nao leva caractere proibido', () => {
		const { nome } = bookmarkParaNota({ ...base, texto: 'a/b:c*d?e"f<g>h|i' });
		expect(nome).not.toMatch(/[\\/:*?"<>|]/);
	});

	test('aspas no texto nao quebram o YAML', () => {
		const { conteudo } = bookmarkParaNota({ ...base, texto: 'ele disse "oi" e saiu' });
		const linha = conteudo.split('\n').find((l) => l.startsWith('description:'))!;
		expect(() => JSON.parse(linha.slice('description: '.length))).not.toThrow();
	});

	test('sem midia, nao emite image vazio', () => {
		expect(bookmarkParaNota({ ...base, midia: [] }).conteudo).not.toContain('image:');
	});
});

describe('salvarComoNotas roda no service worker', () => {
	const bm = {
		id: '1', autor: 'a', nomeAutor: 'A', texto: 'oi', url: 'https://x.com/a/status/1',
		criadoEm: 'Sun Aug 02 16:10:04 +0000 2026', midia: [], links: [],
	};

	test('nao usa document nem window (o SW nao tem DOM)', async () => {
		// se algo do modulo tocar document/window, isto explode como em producao
		const doc = (globalThis as any).document;
		const win = (globalThis as any).window;
		delete (globalThis as any).document;
		delete (globalThis as any).window;
		try {
			const urls: string[] = [];
			const r = await salvarComoNotas([bm], 'X Bookmarks', 'v', async (u) => { urls.push(u); }, undefined, 0);
			expect(r).toEqual({ salvos: 1, erros: 0 });
			expect(urls[0]).toContain('obsidian://new');
		} finally {
			if (doc) (globalThis as any).document = doc;
			if (win) (globalThis as any).window = win;
		}
	});

	test('a URI leva silent, vault, pasta e conteudo', () => {
		const u = montarUriObsidian('minha nota', 'corpo', 'X Bookmarks', 'meuvault');
		expect(u).toContain('silent=true');
		expect(u).toContain('vault=meuvault');
		expect(u).toContain(encodeURIComponent('X Bookmarks/minha nota'));
		expect(u).toContain('content=corpo');
	});

	test('uma nota que falha nao derruba o lote inteiro', async () => {
		let n = 0;
		const r = await salvarComoNotas([bm, { ...bm, id: '2' }, { ...bm, id: '3' }], 'p', 'v',
			async () => { if (++n === 2) throw new Error('falhou'); }, undefined, 0);
		expect(r).toEqual({ salvos: 2, erros: 1 });
	});
});

describe('ponte com o plugin do Obsidian', () => {
	const bm = {
		id: '1', autor: 'a', nomeAutor: 'A', texto: 'oi', url: 'https://x.com/a/status/1',
		criadoEm: 'Sun Aug 02 16:10:04 +0000 2026', midia: [], links: [],
	};

	test('detecta o plugin pelo /ping', async () => {
		globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ protocol: 1, plugin: 'clippings-gallery' }) })) as unknown as typeof fetch;
		expect(await pluginDisponivel()).toBe(true);
	});

	test('sync rejects incompatible bridge protocol instead of falling back', async () => {
		globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ protocol: 2, plugin: 'clippings-gallery' }) })) as unknown as typeof fetch;
		await expect(pluginDisponivel()).rejects.toThrow(/protocol/i);
	});

	test('plugin fora do ar nao explode, so devolve false', async () => {
		globalThis.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
		expect(await pluginDisponivel()).toBe(false);
	});

	test('manda TUDO num POST so — e o que evita roubos de foco repetidos', async () => {
		const chamadas: any[] = [];
		globalThis.fetch = vi.fn(async (url: any, opts: any) => {
			chamadas.push({ url, body: JSON.parse(opts.body) });
			return { ok: true, json: async () => ({ criados: 3, pulados: 0, erros: 0 }) };
		}) as unknown as typeof fetch;

		const r = await enviarPelaPonte([bm, { ...bm, id: '2' }, { ...bm, id: '3' }], 'X Bookmarks');
		expect(chamadas).toHaveLength(1); // UMA requisicao, nao uma por nota
		expect(chamadas[0].body.bookmarks).toHaveLength(3);
		expect(chamadas[0].body.pasta).toBe('X Bookmarks');
		expect(r.criados).toBe(3);
	});

	test('erro do plugin vira excecao, pra cair no fallback', async () => {
		globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
		await expect(enviarPelaPonte([bm], 'p')).rejects.toThrow(/500/);
	});
});

describe('authenticated Corebrain bridge', () => {
	test('uses Clippings as the fresh-install X bookmark folder', () => {
		expect(DEFAULT_X_BOOKMARK_FOLDER).toBe('Clippings');
	});

	test('does not advance the cursor when any fetched bookmark failed', () => {
		expect(podeAvancarMarcador(3, 2, 0, 1, true)).toBe(false);
		expect(podeAvancarMarcador(3, 2, 1, 0, true)).toBe(true);
		expect(podeAvancarMarcador(3, 3, 0, 0, false)).toBe(false);
		expect(podeAvancarMarcador(0, 0, 0, 0, true)).toBe(false);
	});

	test('uses configured port and bearer token for bridge requests', async () => {
		const get = vi.spyOn(browser.storage.local, 'get').mockResolvedValue({
			corebrain_bridge_port: 27126,
			corebrain_bridge_token: 'secret-token',
		} as any);
		const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ existe: false }) });
		vi.stubGlobal('fetch', fetcher);
		await jaNaGaleria('https://a.dev');
		const sentHeaders = fetcher.mock.calls[0][1].headers as Headers;
		expect(sentHeaders.get('Authorization')).toBe('Bearer secret-token');
		expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:27126/tem?url=https%3A%2F%2Fa.dev');
		expect(get).toHaveBeenCalled();
	});

	test('does not fall back to obsidian URI when bridge authentication fails', async () => {
		vi.spyOn(browser.storage.local, 'get').mockResolvedValue({
			corebrain_bridge_port: 27125,
			corebrain_bridge_token: 'wrong',
		} as any);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '' }));
		await expect(clipPelaPonte('body', 'note', 'Clippings')).rejects.toThrow(/authentication/i);
	});

	test('does not fall back to obsidian URI when bridge rejects the payload', async () => {
		vi.spyOn(browser.storage.local, 'get').mockResolvedValue({
			corebrain_bridge_port: 27125,
			corebrain_bridge_token: 'valid',
		} as any);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 413, text: async () => '' }));
		await expect(clipPelaPonte('body', 'note', 'Clippings')).rejects.toThrow(/413/);
	});
});
