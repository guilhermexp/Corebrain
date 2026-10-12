// @vitest-environment jsdom
import browser from 'webextension-polyfill';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initXSync } from './x-sync-ui';

describe('X sync result feedback', () => {
	let syncResult: any;

	beforeEach(() => {
		document.body.innerHTML = `
			<button id="x-sync"></button>
			<div id="x-sync-status" class="is-hidden">
				<span id="x-sync-texto"></span>
				<div id="x-sync-progresso"></div>
			</div>`;
		syncResult = { success: true, salvos: 0, pulados: 0, erros: 0, encontrados: 0, incompleto: false };
		vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async (message: any) => {
			if (message.action === 'x-bookmarks-status') return { logado: true } as any;
			if (message.action === 'x-bookmarks-sync-e-salvar') return syncResult;
			return {} as any;
		});
	});

	it('shows failures and duplicate count instead of claiming everything is up to date', async () => {
		syncResult = { success: true, salvos: 0, pulados: 5, erros: 2, encontrados: 7, incompleto: true };
		initXSync();
		document.getElementById('x-sync')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		await vi.waitFor(() => expect(document.getElementById('x-sync-texto')!.textContent).toContain('2 erros'));
		expect(document.getElementById('x-sync-texto')!.textContent).toContain('5 já existiam');
		expect(document.getElementById('x-sync-texto')!.textContent).not.toMatch(/tudo em dia/i);
		expect(document.getElementById('x-sync-status')!.classList.contains('tem-erro')).toBe(true);
	});

	it('reports an incomplete page scan as partial, not as an empty successful sync', async () => {
		syncResult = { success: true, salvos: 0, pulados: 0, erros: 0, encontrados: 3, incompleto: true };
		initXSync();
		document.getElementById('x-sync')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		await vi.waitFor(() => expect(document.getElementById('x-sync-texto')!.textContent).toMatch(/parcial/i));
		expect(document.getElementById('x-sync-texto')!.textContent).not.toMatch(/tudo em dia/i);
	});

	it('distinguishes already-present bookmarks from a sync with no result data', async () => {
		syncResult = { success: true, salvos: 0, pulados: 4, erros: 0, encontrados: 4, incompleto: false };
		initXSync();
		document.getElementById('x-sync')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		await vi.waitFor(() => expect(document.getElementById('x-sync-texto')!.textContent).toContain('4 já existiam'));
	});
});
