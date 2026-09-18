import { describe, test, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';
import { saveToObsidian } from './obsidian-note-creator';

/**
 * Importacao em lote NAO pode abrir as notas. Sem silent=true, sincronizar
 * bookmarks abriria uma janela por nota de uma vez so.
 */
describe('saveToObsidian em lote', () => {
	let urls: string[];

	let acoes: string[];

	beforeEach(() => {
		urls = [];
		acoes = [];
		vi.spyOn(browser.runtime, 'sendMessage').mockImplementation((async (m: any) => {
			if (m?.url) { urls.push(m.url); acoes.push(m.action); }
			return {};
		}) as any);
	});

	test('forcarSilencioso manda silent=true e o conteudo na URI', async () => {
		await saveToObsidian('corpo da nota', 'minha nota', 'X Bookmarks', 'meuvault', 'create', true);
		expect(urls).toHaveLength(1);
		expect(urls[0]).toContain('silent=true');
		expect(urls[0]).toContain('content=');
		expect(urls[0]).toContain('vault=meuvault');
	});

	test('lote usa aba dedicada, nunca a aba ativa do usuario', async () => {
		// navegar a aba ativa sequestraria a pagina aberta e esbarra no CSP do site
		await saveToObsidian('corpo', 'nota', 'X Bookmarks', 'v', 'create', true);
		expect(acoes).toEqual(['openObsidianUrlEmLote']);
		expect(acoes).not.toContain('openObsidianUrl');
	});

	test('clip normal continua navegando a aba ativa', async () => {
		await saveToObsidian('corpo', 'nota', '', 'v', 'create');
		expect(acoes).toEqual(['openObsidianUrl']);
	});

	test('clip normal nao e forcado a silencioso', async () => {
		await saveToObsidian('corpo', 'nota', '', 'meuvault', 'create');
		expect(urls.join('')).not.toContain('silent=true');
	});
});
