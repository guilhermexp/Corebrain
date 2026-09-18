import browser from 'webextension-polyfill';

/**
 * Botao + barra de progresso do sync de bookmarks no popup.
 *
 * O trabalho pesado roda no service worker de proposito: o popup fecha assim que
 * perde o foco, e mataria a paginacao no meio. Aqui so mostramos o andamento e,
 * se o popup for reaberto, voltamos a acompanhar o que ja estava rodando.
 */

let cancelado = false;

function el<T extends HTMLElement>(id: string): T | null {
	return document.getElementById(id) as T | null;
}

function mostrar(texto: string, pct?: number, erro = false) {
	const caixa = el('x-sync-status');
	const txt = el('x-sync-texto');
	const barra = el('x-sync-progresso');
	if (!caixa || !txt || !barra) return;

	caixa.classList.remove('is-hidden');
	caixa.classList.toggle('tem-erro', erro);
	txt.textContent = texto;
	// sem pct conhecido, a barra fica indeterminada (a fase de busca nao sabe o total)
	barra.classList.toggle('indeterminado', pct === undefined);
	barra.style.width = pct === undefined ? '100%' : `${Math.min(100, Math.round(pct))}%`;
}

function esconder(apos = 4000) {
	setTimeout(() => el('x-sync-status')?.classList.add('is-hidden'), apos);
}

export function initXSync(): void {
	const botao = el<HTMLAnchorElement>('x-sync');
	if (!botao) return;

	// se o popup reabrir no meio de um sync, o progresso continua chegando
	browser.runtime.onMessage.addListener((message: unknown): undefined => {
		const msg = message as { action?: string; qtd?: number; feitos?: number; total?: number };
		if (msg?.action === 'x-bookmarks-progress') {
			mostrar(`Buscando no X… ${msg.qtd} bookmarks`);
		}
		if (msg?.action === 'x-bookmarks-saving' && msg.total) {
			mostrar(`Gravando ${msg.feitos} de ${msg.total}…`, ((msg.feitos || 0) / msg.total) * 100);
		}
		return undefined;
	});

	el('x-sync-cancelar')?.addEventListener('click', (e) => {
		e.preventDefault();
		cancelado = true;
		browser.runtime.sendMessage({ action: 'x-bookmarks-cancelar' });
		mostrar('Cancelando…');
	});

	botao.addEventListener('click', async (e) => {
		e.preventDefault();
		cancelado = false;
		botao.classList.add('esta-sincronizando');
		mostrar('Verificando sessão do X…');

		try {
			const st: any = await browser.runtime.sendMessage({ action: 'x-bookmarks-status' });
			if (!st?.logado) {
				mostrar('Faça login em x.com para sincronizar.', 0, true);
				esconder(6000);
				return;
			}

			mostrar('Buscando no X…');
			const r: any = await browser.runtime.sendMessage({ action: 'x-bookmarks-sync-e-salvar' });

			if (cancelado) {
				mostrar('Cancelado.', 0);
			} else if (!r?.success) {
				mostrar(r?.error || 'Falhou ao sincronizar.', 0, true);
				esconder(8000);
				return;
			} else if (r.salvos === 0) {
				mostrar('Tudo em dia — nenhum bookmark novo.', 100);
			} else {
				mostrar(`${r.salvos} bookmarks salvos${r.erros ? ` · ${r.erros} com erro` : ''}`, 100);
			}
			esconder();
		} catch (err) {
			mostrar((err as Error).message || 'Erro inesperado.', 0, true);
			esconder(8000);
		} finally {
			botao.classList.remove('esta-sincronizando');
		}
	});
}
