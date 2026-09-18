import { describe, test, expect, vi, beforeEach } from 'vitest';
import { jaNaGaleria } from './x-bookmarks';

/**
 * Clipping normal nao passa pela ponte: ele so cria a nota. Sem esta consulta,
 * clipar a mesma pagina duas vezes gera duas notas na galeria — foi o que
 * produziu 5 duplicatas de repositorio do GitHub no vault.
 */
describe('jaNaGaleria', () => {
	beforeEach(() => vi.restoreAllMocks());

	test('reconhece URL que ja esta na galeria', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ existe: true, caminho: 'Clippings/x.md' }),
		}));
		expect(await jaNaGaleria('https://a.dev')).toEqual({ existe: true, caminho: 'Clippings/x.md' });
	});

	test('URL nova passa', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ existe: false, caminho: null }),
		}));
		expect(await jaNaGaleria('https://nova.dev')).toEqual({ existe: false, caminho: null });
	});

	test('manda a URL codificada, senao ? e & do link viram query da ponte', async () => {
		const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ existe: false }) });
		vi.stubGlobal('fetch', f);
		await jaNaGaleria('https://a.dev/p?x=1&y=2');
		expect(f.mock.calls[0][0]).toContain(encodeURIComponent('https://a.dev/p?x=1&y=2'));
	});

	// O PONTO: Obsidian fechado nao pode impedir de clipar. null = "nao sei",
	// e quem chama segue. Bloquear aqui quebraria a extensao fora do Obsidian.
	test('plugin fora do ar devolve null, nao um falso "existe"', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
		expect(await jaNaGaleria('https://a.dev')).toBeNull();
	});

	test('resposta de erro HTTP tambem devolve null', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
		expect(await jaNaGaleria('https://a.dev')).toBeNull();
	});

	test('resposta sem os campos esperados nao inventa caminho', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ existe: 1 }) }));
		expect(await jaNaGaleria('https://a.dev')).toEqual({ existe: true, caminho: null });
	});

	test('URL vazia nem consulta', async () => {
		const f = vi.fn();
		vi.stubGlobal('fetch', f);
		expect(await jaNaGaleria('')).toBeNull();
		expect(f).not.toHaveBeenCalled();
	});
});
