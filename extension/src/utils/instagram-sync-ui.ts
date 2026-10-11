import { panelSourceTabId } from './panel-context';
import browser from 'webextension-polyfill';
import type { InstagramSyncPhase, InstagramSyncStatus } from './instagram-sync';

const RUNTIME_MESSAGE_TIMEOUT_MS = 10_000;
const PHASE_ORDER: Record<InstagramSyncPhase, number> = {
	idle: 0,
	'checking-bridge': 1,
	fetching: 2,
	saving: 3,
	complete: 4,
	partial: 4,
	cancelled: 4,
	error: 4,
	interrupted: 4,
};

function el<T extends HTMLElement>(id: string): T | null {
	return document.getElementById(id) as T | null;
}

function contagens(status: InstagramSyncStatus): string {
	return `${status.created} criados · ${status.skipped} já existiam · ${status.errors} erros`;
}

/** Pure formatter so important partial/error states can be tested without a DOM. */
export function formatInstagramSyncStatus(status: InstagramSyncStatus): string {
	if (status.running) {
		const prefixo = status.cancelRequested ? 'Cancelando importação… ' : '';
		if (status.phase === 'checking-bridge') return `${prefixo}Conferindo conexão com Corebrain…`;
		if (status.phase === 'fetching') {
			return `${prefixo}Buscando salvos no Instagram… página ${status.pages} · ${status.found} encontrados`;
		}
		if (status.phase === 'saving') {
			return `${prefixo}Importando ${status.total} salvos… ${status.processed} de ${status.total}`;
		}
		return `${prefixo}Importando salvos do Instagram…`;
	}

	const notes = status.warnings.length ? ` · ${status.warnings.join(' · ')}` : '';
	switch (status.phase) {
		case 'complete':
			return status.found === 0
				? 'Nenhum post salvo encontrado no Instagram.'
				: `Importação concluída — ${contagens(status)}${notes}`;
		case 'partial':
			return `Importação parcial — ${contagens(status)}${status.error ? ` · ${status.error}` : ''}${notes}`;
		case 'cancelled':
			return `Importação cancelada — ${contagens(status)}${status.error ? ` · ${status.error}` : ''}${notes}`;
		case 'interrupted':
			return `Importação interrompida — ${status.error || 'Inicie uma nova varredura para continuar.'} · ${contagens(status)}${notes}`;
		case 'error':
			return `Importação não concluída — ${status.error || 'Erro inesperado.'} · ${contagens(status)}${notes}`;
		default:
			return '';
	}
}

function statusValido(value: unknown): value is InstagramSyncStatus {
	if (!value || typeof value !== 'object') return false;
	const status = value as Partial<InstagramSyncStatus>;
	const phases: InstagramSyncPhase[] = ['idle', 'checking-bridge', 'fetching', 'saving', 'complete', 'partial', 'cancelled', 'error', 'interrupted'];
	const counts = [status.found, status.processed, status.total, status.pages, status.created, status.skipped, status.errors];
	return typeof status.running === 'boolean'
		&& phases.includes(status.phase as InstagramSyncPhase)
		&& counts.every((count) => typeof count === 'number' && Number.isFinite(count))
		&& typeof status.completeScan === 'boolean'
		&& typeof status.cancelRequested === 'boolean'
		&& (status.error === undefined || typeof status.error === 'string')
		&& Array.isArray(status.warnings)
		&& status.warnings.every((warning) => typeof warning === 'string')
		&& typeof status.updatedAt === 'number' && Number.isFinite(status.updatedAt);
}

function mensagemErro(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return 'A extensão não recebeu uma resposta válida ao iniciar a importação.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object';
}

function respostaDeInicioValida(value: unknown): value is {
	success: boolean;
	accepted?: boolean;
	error?: string;
	status: InstagramSyncStatus;
} {
	return isRecord(value)
		&& typeof value.success === 'boolean'
		&& (value.accepted === undefined || typeof value.accepted === 'boolean')
		&& (value.error === undefined || typeof value.error === 'string')
		&& statusValido(value.status);
}

function respostaDeCancelamentoValida(value: unknown): value is { ok: boolean; status?: InstagramSyncStatus; error?: string } {
	return isRecord(value)
		&& typeof value.ok === 'boolean'
		&& (value.status === undefined || statusValido(value.status))
		&& (value.error === undefined || typeof value.error === 'string');
}

function mensagemSemResposta(): Error {
	return new Error('A extensão não respondeu a tempo. Não foi possível confirmar o andamento; a importação pode continuar em segundo plano. Feche e reabra a extensão para conferir o status.');
}

function sendMessageComPrazo(message: unknown): Promise<unknown> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		browser.runtime.sendMessage(message),
		new Promise<never>((_, reject) => { timer = setTimeout(() => reject(mensagemSemResposta()), RUNTIME_MESSAGE_TIMEOUT_MS); }),
	]).finally(() => { if (timer) clearTimeout(timer); });
}

function statusMaisRecente(status: InstagramSyncStatus, anterior?: InstagramSyncStatus): boolean {
	if (!anterior) return true;
	if (status.updatedAt !== anterior.updatedAt) return status.updatedAt > anterior.updatedAt;
	const ordem = PHASE_ORDER[status.phase] - PHASE_ORDER[anterior.phase];
	if (ordem !== 0) return ordem > 0;
	// Controller snapshots written in the same millisecond can still advance counts.
	return (status.cancelRequested && !anterior.cancelRequested)
		|| status.found > anterior.found
		|| status.pages > anterior.pages
		|| status.processed > anterior.processed
		|| status.total > anterior.total
		|| status.created > anterior.created
		|| status.skipped > anterior.skipped
		|| status.errors > anterior.errors;
}

function render(status: InstagramSyncStatus, startPendente = false): void {
	const caixa = el('instagram-sync-status');
	const texto = el('instagram-sync-texto');
	const barra = el('instagram-sync-progresso');
	const botao = el<HTMLAnchorElement>('instagram-sync');
	const cancelar = el<HTMLAnchorElement>('instagram-sync-cancelar');
	if (!caixa || !texto || !barra) return;
	const bloqueado = status.running || startPendente;
	botao?.classList.toggle('esta-sincronizando', bloqueado);
	botao?.setAttribute('aria-disabled', String(bloqueado));
	cancelar?.classList.toggle('is-hidden', !status.running);

	const mensagem = formatInstagramSyncStatus(status);
	if (!mensagem) {
		caixa.classList.add('is-hidden');
		return;
	}
	caixa.classList.remove('is-hidden');
	caixa.classList.toggle('tem-erro', ['partial', 'cancelled', 'interrupted', 'error'].includes(status.phase));
	caixa.classList.toggle('esta-sincronizando', bloqueado);
	texto.textContent = mensagem;
	texto.setAttribute('title', mensagem);
	const percentual = status.phase === 'saving' && status.total > 0
		? (status.processed / status.total) * 100
		: undefined;
	barra.classList.toggle('indeterminado', status.running && percentual === undefined);
	barra.style.width = percentual === undefined ? '100%' : `${Math.min(100, Math.round(percentual))}%`;
}

function mostrarErro(texto: string, status?: InstagramSyncStatus, startPendente = false): void {
	const caixa = el('instagram-sync-status');
	const mensagem = el('instagram-sync-texto');
	const barra = el('instagram-sync-progresso');
	const botao = el<HTMLAnchorElement>('instagram-sync');
	const cancelar = el<HTMLAnchorElement>('instagram-sync-cancelar');
	if (!caixa || !mensagem) return;
	caixa.classList.remove('is-hidden');
	caixa.classList.add('tem-erro');
	caixa.classList.toggle('esta-sincronizando', !!status?.running || startPendente);
	botao?.classList.toggle('esta-sincronizando', !!status?.running || startPendente);
	botao?.setAttribute('aria-disabled', String(!!status?.running || startPendente));
	cancelar?.classList.toggle('is-hidden', !status?.running);
	if (barra) {
		barra.classList.remove('indeterminado');
		barra.style.width = '0%';
	}
	mensagem.textContent = texto;
	mensagem.setAttribute('title', texto);
}

/** Wire the explicit Instagram import button to the service-worker controller. */
export function initInstagramSync(): void {
	const botao = el<HTMLAnchorElement>('instagram-sync');
	if (!botao) return;

	let lastStatus: InstagramSyncStatus | undefined;
	let startPendente = false;
	let interacao = 0;
	const renderSeMaisNovo = (status: InstagramSyncStatus): void => {
		if (!statusMaisRecente(status, lastStatus)) return;
		lastStatus = status;
		render(status, startPendente);
	};

	browser.runtime.onMessage.addListener((message: unknown): undefined => {
		if (!isRecord(message) || message.action !== 'instagram-saved-progress' || !statusValido(message.status)) return undefined;
		renderSeMaisNovo(message.status);
		return undefined;
	});

	el('instagram-sync-cancelar')?.addEventListener('click', async (event) => {
		event.preventDefault();
		const statusAntes = lastStatus;
		const recebeuProgresso = () => lastStatus !== statusAntes;
		try {
			const result: unknown = await sendMessageComPrazo({ action: 'instagram-saved-cancel' });
			if (!respostaDeCancelamentoValida(result)) {
				if (recebeuProgresso()) return;
				mostrarErro('A extensão não recebeu uma resposta válida ao cancelar a importação.', lastStatus, startPendente);
				return;
			}
			if (result.status) renderSeMaisNovo(result.status);
			if (!result.ok && (!recebeuProgresso() || lastStatus === result.status)) mostrarErro(result.error || 'Não foi possível cancelar a importação.', lastStatus, startPendente);
		} catch (error) {
			if (!recebeuProgresso()) mostrarErro(mensagemErro(error), lastStatus, startPendente);
		}
	});

	botao.addEventListener('click', async (event) => {
		event.preventDefault();
		if (startPendente || lastStatus?.running) return;
		startPendente = true;
		const statusAntes = lastStatus;
		const recebeuProgresso = () => lastStatus !== statusAntes && lastStatus?.phase !== 'idle';
		interacao++;
		caixaInicio();
		try {
			const sourceTabId = panelSourceTabId(window.location.search);
			const result: unknown = await sendMessageComPrazo({ action: 'instagram-saved-sync', ...(sourceTabId === undefined ? {} : { tabId: sourceTabId }) });
			if (!respostaDeInicioValida(result)) {
				if (recebeuProgresso()) return;
				const erro = isRecord(result) && typeof result.error === 'string'
					? result.error
					: 'A extensão não recebeu uma resposta válida ao iniciar a importação.';
				mostrarErro(erro, lastStatus, true);
				return;
			}
			renderSeMaisNovo(result.status);
			if (!result.success && !result.status.running && lastStatus === result.status) {
				mostrarErro(result.error || 'Não foi possível iniciar a importação.', lastStatus, true);
			}
		} catch (error) {
			if (!recebeuProgresso()) mostrarErro(mensagemErro(error), lastStatus, true);
		} finally {
			startPendente = false;
			// Unlock only: repainting an old idle/terminal snapshot here would
			// erase the start error or timeout that was just displayed.
			const running = lastStatus?.running === true;
			botao?.classList.toggle('esta-sincronizando', running);
			botao?.setAttribute('aria-disabled', String(running));
		}
	});

	const revisionInicial = interacao;
	void sendMessageComPrazo({ action: 'instagram-saved-status' })
		.then((status) => {
			if (revisionInicial === interacao && statusValido(status)) renderSeMaisNovo(status);
		})
		.catch(() => {});

	function caixaInicio(): void {
		const caixa = el('instagram-sync-status');
		const texto = el('instagram-sync-texto');
		const barra = el('instagram-sync-progresso');
		caixa?.classList.remove('is-hidden', 'tem-erro');
		caixa?.classList.add('esta-sincronizando');
		if (texto) {
			texto.textContent = 'Iniciando importação…';
			texto.setAttribute('title', 'Iniciando importação…');
		}
		barra?.classList.add('indeterminado');
		if (barra) barra.style.width = '100%';
		botao?.classList.add('esta-sincronizando');
		botao?.setAttribute('aria-disabled', 'true');
		el('instagram-sync-cancelar')?.classList.add('is-hidden');
	}
}
