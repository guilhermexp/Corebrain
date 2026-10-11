import type {
	InstagramSavedPost,
	InstagramSyncResult,
	InstagramTransportResult,
} from './instagram-saved';

export type InstagramSyncPhase =
	| 'idle'
	| 'checking-bridge'
	| 'fetching'
	| 'saving'
	| 'complete'
	| 'partial'
	| 'cancelled'
	| 'error'
	| 'interrupted';

export interface InstagramSyncStatus {
	running: boolean;
	phase: InstagramSyncPhase;
	found: number;
	processed: number;
	total: number;
	pages: number;
	created: number;
	skipped: number;
	errors: number;
	completeScan: boolean;
	cancelRequested: boolean;
	error?: string;
	warnings: string[];
	updatedAt: number;
}

export interface InstagramSyncControllerDependencies {
	bridgeAvailable: () => Promise<boolean>;
	fetchSaved: (
		onProgress: (quantity: number, page: number) => void,
		shouldCancel: () => boolean,
	sourceTabId?: number,
	) => Promise<InstagramSyncResult>;
	sendSaved: (
		posts: InstagramSavedPost[],
		folder: string,
		onProgress: (finished: number, total: number) => void,
		shouldCancel: () => boolean,
	) => Promise<InstagramTransportResult>;
	getFolder: () => Promise<string>;
	loadStatus: () => Promise<unknown>;
	saveStatus: (status: InstagramSyncStatus) => Promise<void>;
	onStatus?: (status: InstagramSyncStatus) => void;
	now?: () => number;
}

export interface InstagramSyncStartResult {
	success: boolean;
	accepted?: boolean;
	error?: string;
	status: InstagramSyncStatus;
}

const STORAGE_KEY = 'instagram_saved_sync_status';
const RESTART_MESSAGE =
	'A extensão foi interrompida durante a importação. Inicie uma nova varredura; as notas já criadas serão ignoradas pela deduplicação.';

function statusInicial(now: number): InstagramSyncStatus {
	return {
		running: false,
		phase: 'idle',
		found: 0,
		processed: 0,
		total: 0,
		pages: 0,
		created: 0,
		skipped: 0,
		errors: 0,
		completeScan: false,
		cancelRequested: false,
		warnings: [],
		updatedAt: now,
	};
}

function statusValido(value: unknown): value is InstagramSyncStatus {
	if (!value || typeof value !== 'object') return false;
	const status = value as Partial<InstagramSyncStatus>;
	return typeof status.running === 'boolean'
		&& typeof status.phase === 'string'
		&& typeof status.found === 'number'
		&& typeof status.processed === 'number'
		&& typeof status.total === 'number'
		&& typeof status.pages === 'number'
		&& typeof status.created === 'number'
		&& typeof status.skipped === 'number'
		&& typeof status.errors === 'number'
		&& Array.isArray(status.warnings);
}

function mensagemErro(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return String(error || 'Erro inesperado durante a importação.');
}

/**
 * Controls one explicit Instagram import at a time. The injected dependencies
 * keep the state machine testable without a browser, network session, or vault.
 */
export function createInstagramSyncController(deps: InstagramSyncControllerDependencies) {
	const now = deps.now || Date.now;
	let status = statusInicial(now());
	let cancelRequested = false;
	let ready: Promise<void> | undefined;
	let persistenceQueue: Promise<void> = Promise.resolve();

	const cloneStatus = (): InstagramSyncStatus => ({ ...status, warnings: [...status.warnings] });

	async function persistAndPublish(): Promise<void> {
		status.updatedAt = now();
		const current = cloneStatus();
		// Progress callbacks may arrive faster than storage writes complete. Queue
		// snapshots so an older progress write cannot replace the terminal result.
		const write = persistenceQueue.then(() => deps.saveStatus(current));
		persistenceQueue = write.then(() => undefined, () => undefined);
		try { await write; } catch { /* storage failure must not abort the network job */ }
		try { deps.onStatus?.(current); } catch { /* UI notification is best-effort */ }
	}

	async function hydrate(): Promise<void> {
		if (!ready) {
			ready = (async () => {
				const stored = await deps.loadStatus();
				if (statusValido(stored)) {
					status = { ...statusInicial(now()), ...stored, warnings: [...stored.warnings] };
					if (status.running) {
						// MV3 may stop a worker mid-job. Report that fact instead of
						// suggesting this implementation can resume its traversal.
						status.running = false;
						status.phase = 'interrupted';
						status.cancelRequested = false;
						status.error = RESTART_MESSAGE;
						await persistAndPublish();
					}
				}
			})();
		}
		await ready;
	}

	async function update(patch: Partial<InstagramSyncStatus>): Promise<void> {
		status = { ...status, ...patch, warnings: patch.warnings ? [...patch.warnings] : status.warnings };
		await persistAndPublish();
	}

	function shouldCancel(): boolean {
		return cancelRequested;
	}

	async function run(sourceTabId?: number): Promise<void> {
		try {
			await update({ phase: 'checking-bridge', error: undefined });
			let timer: ReturnType<typeof setTimeout> | undefined;
			const bridgeAvailable = await Promise.race([
				deps.bridgeAvailable(),
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(new Error('A conexão com o Corebrain demorou demais. Confira se o Obsidian e o plugin estão abertos e tente novamente.')), 10_000);
				}),
			]).finally(() => { if (timer) clearTimeout(timer); });
			if (!bridgeAvailable) {
				throw new Error('Corebrain não respondeu. Abra o Obsidian, ative o plugin e confira o pareamento antes de importar.');
			}
			if (shouldCancel()) {
				await update({ running: false, phase: 'cancelled', cancelRequested: true });
				return;
			}

			await update({ phase: 'fetching' });
			const feed = await deps.fetchSaved((quantity, page) => {
				status.found = Math.max(status.found, quantity);
				status.pages = Math.max(status.pages, page);
				void persistAndPublish();
			}, shouldCancel, sourceTabId);
			status.found = Math.max(status.found, feed.novos.length);
			status.total = feed.novos.length;
			status.pages = Math.max(status.pages, feed.paginas);
			status.completeScan = feed.alcancouFim;
			await persistAndPublish();

			if (shouldCancel()) {
				await update({ running: false, phase: 'cancelled', cancelRequested: true });
				return;
			}
			if (!feed.alcancouFim) {
				await update({
					running: false,
					phase: 'partial',
					cancelRequested: false,
					error: 'A leitura terminou antes do fim da lista de salvos; nenhum post foi enviado para evitar uma importação incompleta.',
				});
				return;
			}

			if (feed.novos.length > 0) {
				await update({ phase: 'saving' });
				const folder = await deps.getFolder();
				const result = await deps.sendSaved(feed.novos, folder, (finished, total) => {
					status.processed = Math.max(status.processed, finished);
					status.total = Math.max(status.total, total);
					void persistAndPublish();
				}, shouldCancel);
				const warnings = result.avisos ? [...result.avisos] : [];
				const cancelled = !!result.cancelado || shouldCancel();
				const hasErrors = result.erros > 0 || !feed.alcancouFim;
				await update({
					running: false,
					phase: cancelled ? 'cancelled' : hasErrors ? 'partial' : 'complete',
					created: result.criados,
					skipped: result.pulados,
					errors: result.erros,
					cancelRequested: cancelled,
					error: feed.alcancouFim ? undefined : 'A leitura terminou antes do fim da lista de salvos; o resultado é parcial.',
					warnings,
				});
				return;
			}

			await update({
				running: false,
				phase: feed.alcancouFim ? 'complete' : 'partial',
				cancelRequested: false,
				error: feed.alcancouFim ? undefined : 'A leitura terminou antes do fim da lista de salvos; o resultado é parcial.',
			});
		} catch (error) {
			await update({
				running: false,
				phase: 'error',
				error: mensagemErro(error),
				cancelRequested: false,
			});
		}
	}

	return {
		async getStatus(): Promise<InstagramSyncStatus> {
			await hydrate();
			return cloneStatus();
		},
		async start(sourceTabId?: number): Promise<InstagramSyncStartResult> {
			await hydrate();
			if (status.running) return { success: false, error: 'Uma importação de salvos do Instagram já está em andamento.', status: cloneStatus() };
			cancelRequested = false;
			status = { ...statusInicial(now()), running: true, phase: 'checking-bridge' };
			await persistAndPublish();
			// Return to the popup immediately. The service worker owns the work, so
			// popup closure does not leave a long-lived sendMessage response open.
			void run(sourceTabId);
			return { success: true, accepted: true, status: cloneStatus() };
		},
		async cancel(): Promise<InstagramSyncStatus> {
			await hydrate();
			if (status.running) {
				cancelRequested = true;
				await update({ cancelRequested: true });
			}
			return cloneStatus();
		},
	};
}

export const INSTAGRAM_SYNC_STORAGE_KEY = STORAGE_KEY;
