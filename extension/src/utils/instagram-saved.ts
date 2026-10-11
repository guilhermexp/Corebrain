/**
 * Reads Instagram's saved-post feed from the user's existing logged-in tab and
 * transports the resulting notes through the paired Corebrain bridge.
 *
 * Instagram's session is intentionally never read by the extension worker or
 * sent to Corebrain: the injected function reads `csrftoken` and performs a
 * same-origin GET inside the selected instagram.com tab.
 */

import browser from './browser-polyfill';
import { fetchBridge } from './bridge-settings';

export interface InstagramSavedPost {
	id: string;
	autor: string;
	nomeAutor: string;
	texto: string;
	url: string;
	criadoEm: string;
	midia: string[];
}

export interface InstagramSyncResult {
	novos: InstagramSavedPost[];
	paginas: number;
	alcancouFim: boolean;
}

export interface InstagramTransportResult {
	criados: number;
	pulados: number;
	erros: number;
	cancelado?: boolean;
	avisos?: string[];
}

export interface InstagramBridgeNote {
	nome: string;
	conteudo: string;
	source: string;
}

export type InstagramSearchProgress = (qtd: number, pagina: number) => void;
export type InstagramImportProgress = (feitos: number, total: number) => void;

export const DEFAULT_INSTAGRAM_SAVED_FOLDER = 'Clippings';

const INSTAGRAM_APP_ID = '936619743392459';
const SAVED_FEED_PATH = '/api/v1/feed/saved/posts/';
const PAGE_LIMIT = 400;
const ITEM_LIMIT = 20_000;
const REQUEST_TIMEOUT_MS = 20_000;
const PAGE_DELAY_MS = 350;
const BRIDGE_CHUNK_SIZE = 100;
const BRIDGE_REQUEST_TIMEOUT_MS = 20_000;
const BRIDGE_NAME_MAX_UNITS = 120;
const BRIDGE_NAME_MAX_BYTES = 180;

type InjectedFeedPage = {
	httpStatus: number;
	payload: unknown;
	semCsrf?: boolean;
	timeout?: boolean;
	networkError?: boolean;
};

type ParsedFeedPage = {
	posts: InstagramSavedPost[];
	more: boolean;
	nextCursor: string | null;
};

/**
 * This function is serialized by `scripting.executeScript` and run inside the
 * active Instagram document. Keep it self-contained: closed-over module values
 * are unavailable after serialization. Do not use async/await here: the ES6
 * build extracts __awaiter into module scope, which is not injected with func.
 */
function buscarPaginaSalvosNoInstagram(cursor?: string): Promise<InjectedFeedPage> {
	const locationUrl = new URL(location.href);
	if (
		locationUrl.protocol !== 'https:' ||
		(locationUrl.hostname !== 'www.instagram.com' && locationUrl.hostname !== 'instagram.com')
	) {
		return Promise.resolve({ httpStatus: 0, payload: null, networkError: true });
	}

	const csrf = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1];
	if (!csrf) return Promise.resolve({ httpStatus: 0, payload: null, semCsrf: true });

	const url = new URL('/api/v1/feed/saved/posts/', locationUrl.origin);
	if (cursor) url.searchParams.set('max_id', cursor);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 20_000);
	return Promise.resolve().then(() => fetch(url.href, {
			method: 'GET',
			credentials: 'include',
			cache: 'no-store',
			headers: {
				Accept: 'application/json',
				'x-ig-app-id': '936619743392459',
				'x-csrftoken': csrf,
				'x-requested-with': 'XMLHttpRequest',
			},
			signal: controller.signal,
		})).then((response): Promise<InjectedFeedPage> | InjectedFeedPage => {
			if (!response.ok) return { httpStatus: response.status, payload: null };
			return response.json().then(
				(payload: unknown) => ({ httpStatus: response.status, payload }),
				() => ({ httpStatus: response.status, payload: null, networkError: true }),
			);
		}).catch((error): InjectedFeedPage => ({
			httpStatus: 0,
			payload: null,
			timeout: error instanceof Error && error.name === 'AbortError',
			networkError: !(error instanceof Error && error.name === 'AbortError'),
		})).finally(() => clearTimeout(timer));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function validShortcode(value: unknown): string {
	const code = stringValue(value);
	return /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : '';
}

function instagramImageUrl(value: unknown): string {
	const candidate = stringValue(value);
	if (!candidate) return '';
	try {
		const url = new URL(candidate);
		const hostAllowed = ['cdninstagram.com', 'fbcdn.net'].some(
			(domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
		);
		return url.protocol === 'https:' && hostAllowed && !url.username && !url.password && !url.port
			? url.href
			: '';
	} catch {
		return '';
	}
}

function bestImageFromVersions(value: unknown): string {
	if (!isRecord(value) || !Array.isArray(value.candidates)) return '';
	let bestUrl = '';
	let bestArea = -1;
	for (const candidate of value.candidates) {
		if (!isRecord(candidate)) continue;
		const url = instagramImageUrl(candidate.url);
		if (!url) continue;
		const width = typeof candidate.width === 'number' && Number.isFinite(candidate.width) ? candidate.width : 0;
		const height = typeof candidate.height === 'number' && Number.isFinite(candidate.height) ? candidate.height : 0;
		const area = width * height;
		if (!bestUrl || area > bestArea) {
			bestUrl = url;
			bestArea = area;
		}
	}
	return bestUrl;
}

function imagesFromMedia(media: Record<string, unknown>): string[] {
	const found: string[] = [];
	const addBestImage = (value: unknown): void => {
		const url = bestImageFromVersions(value);
		if (url && !found.includes(url)) found.push(url);
	};

	const carousel = Array.isArray(media.carousel_media) ? media.carousel_media : [];
	if (carousel.length) {
		for (const child of carousel) {
			if (isRecord(child)) addBestImage(child.image_versions2);
		}
	} else {
		addBestImage(media.image_versions2);
		addBestImage(media.image_versions);
	}
	return found;
}

function publicationDate(value: unknown): string {
	let date: Date;
	if (typeof value === 'number' && Number.isFinite(value)) {
		date = new Date(value < 1_000_000_000_000 ? value * 1000 : value);
	} else if (typeof value === 'string' && value.trim()) {
		const numeric = Number(value);
		date = Number.isFinite(numeric) && value.trim() === String(numeric)
			? new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
			: new Date(value);
	} else {
		return '';
	}
	return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function normalizeSavedPost(wrapper: unknown): InstagramSavedPost {
	if (!isRecord(wrapper)) throw new Error('O feed de salvos do Instagram contém um item inválido.');
	const media = isRecord(wrapper.media) ? wrapper.media : wrapper;
	const code = validShortcode(media.code);
	// Shortcode remains stable even if the API changes numeric PK representation.
	const id = code;
	if (!code) throw new Error('O feed do Instagram contém um post sem identidade válida; nada foi importado.');

	const user = isRecord(media.user) ? media.user : isRecord(media.owner) ? media.owner : {};
	const caption = isRecord(media.caption) ? media.caption : {};
	const texto = stringValue(caption.text) || stringValue(media.caption_text);
	const autor = stringValue(user.username);
	const nomeAutor = stringValue(user.full_name) || autor;
	const published = publicationDate(media.taken_at ?? media.taken_at_timestamp ?? caption.created_at);
	const route = media.product_type === 'clips' || media.product_type === 'reel' ? 'reel' : 'p';

	return {
		id,
		autor,
		nomeAutor,
		texto,
		url: `https://www.instagram.com/${route}/${code}/`,
		criadoEm: published,
		midia: imagesFromMedia(media),
	};
}

function parseFeedPage(value: unknown, httpStatus: number): ParsedFeedPage {
	if (httpStatus === 429) {
		throw new Error('O Instagram limitou as requisições (429). Espere alguns minutos e sincronize de novo.');
	}
	if (httpStatus === 401 || httpStatus === 403) {
		throw new Error('A sessão do Instagram expirou. Faça login em instagram.com e tente de novo.');
	}
	if (httpStatus < 200 || httpStatus >= 300) {
		throw new Error(`O Instagram respondeu ${httpStatus || 'sem resposta'} ao ler os salvos.`);
	}
	if (!isRecord(value)) throw new Error('O Instagram retornou um formato inválido para a lista de salvos.');

	const status = stringValue(value.status);
	const message = stringValue(value.message).toLowerCase();
	if (
		status === 'fail' ||
		value.require_login === true ||
		/login_required|checkpoint|challenge/.test(message)
	) {
		throw new Error('O Instagram exige login ou verificação de segurança. Entre em instagram.com e tente de novo.');
	}
	if (status && status !== 'ok') {
		throw new Error('O Instagram recusou a leitura dos salvos; tente novamente mais tarde.');
	}
	if (!Array.isArray(value.items) || typeof value.more_available !== 'boolean') {
		throw new Error('O feed de salvos do Instagram veio incompleto ou em formato inesperado.');
	}

	const posts = value.items.map(normalizeSavedPost);
	const more = value.more_available;
	const nextCursorValue = value.next_max_id;
	let nextCursor: string | null = null;
	if (typeof nextCursorValue === 'string' && nextCursorValue.trim()) nextCursor = nextCursorValue.trim();
	else if (typeof nextCursorValue === 'number' && Number.isFinite(nextCursorValue)) nextCursor = String(nextCursorValue);
	if (more && !nextCursor) throw new Error('O Instagram indicou mais salvos, mas não enviou o cursor da próxima página.');
	if (nextCursor && nextCursor.length > 500) throw new Error('O Instagram retornou um cursor de paginação inválido.');

	return { posts, more, nextCursor };
}

function isInstagramTabUrl(value: unknown): boolean {
	if (typeof value !== 'string') return false;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' && (url.hostname === 'www.instagram.com' || url.hostname === 'instagram.com');
	} catch {
		return false;
	}
}

async function getActiveInstagramTabId(sourceTabId?: number): Promise<number> {
	if (sourceTabId !== undefined) {
		if (!Number.isSafeInteger(sourceTabId) || sourceTabId < 0) throw new Error('Aba de origem do Instagram inválida.');
		const source = await browser.tabs.get(sourceTabId);
		if (!isInstagramTabUrl(source.url)) throw new Error('Abra o Instagram e use o ícone da extensão para sincronizar seus salvos.');
		return sourceTabId;
	}
	const tabs = await browser.tabs.query({ active: true, currentWindow: true });
	const tab = tabs.find((candidate) => candidate.id !== undefined && isInstagramTabUrl(candidate.url));
	if (tab?.id === undefined) throw new Error('Abra seus salvos em uma aba logada do Instagram antes de sincronizar.');
	return tab.id;
}

function executionResult(value: unknown): InjectedFeedPage {
	const candidate = Array.isArray(value) ? value[0]?.result : undefined;
	if (!isRecord(candidate)) throw new Error('Não foi possível ler a resposta da aba do Instagram.');
	return candidate as unknown as InjectedFeedPage;
}

async function fetchSavedPage(tabId: number, cursor?: string): Promise<ParsedFeedPage> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error('A leitura do Instagram demorou demais; sincronização interrompida.')), REQUEST_TIMEOUT_MS + 1_000);
	});
	try {
		const result = await Promise.race([
			browser.scripting.executeScript({
				target: { tabId },
				func: buscarPaginaSalvosNoInstagram,
				args: cursor ? [cursor] : [],
			}),
			timeout,
		]);
		const page = executionResult(result);
		if (page.semCsrf) throw new Error('A sessão do Instagram não está disponível. Faça login em instagram.com e tente de novo.');
		if (page.timeout) throw new Error('A leitura do Instagram excedeu o tempo limite; tente novamente mais tarde.');
		if (page.networkError) throw new Error('Não foi possível ler o feed do Instagram. Verifique a conexão e tente novamente.');
		return parseFeedPage(page.payload, Number(page.httpStatus));
	} catch (error) {
		if (error instanceof Error && /Instagram|instagram|sessão|sessao|feed/i.test(error.message)) throw error;
		throw new Error('Não foi possível executar a leitura na aba do Instagram. Confira se ela continua aberta e tente de novo.');
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Reads all saved posts newest-first from the active Instagram tab. A user
 * cancellation returns the partial result with `alcancouFim: false`; callers
 * must not begin an import unless the scan is complete.
 */
export async function buscarSalvosInstagram(
	aoProgredir?: InstagramSearchProgress,
	deveCancelar?: () => boolean,
	sourceTabId?: number,
): Promise<InstagramSyncResult> {
	const tabId = await getActiveInstagramTabId(sourceTabId);
	const novos: InstagramSavedPost[] = [];
	const seenIds = new Set<string>();
	const seenCursors = new Set<string>();
	let cursor: string | undefined;
	let paginas = 0;
	let alcancouFim = false;

	while (paginas < PAGE_LIMIT) {
		if (deveCancelar?.()) break;
		if (paginas > 0) {
			await delay(PAGE_DELAY_MS);
			if (deveCancelar?.()) break;
		}

		const page = await fetchSavedPage(tabId, cursor);
		paginas++;
		for (const post of page.posts) {
			if (seenIds.has(post.id)) continue;
			seenIds.add(post.id);
			novos.push(post);
			if (novos.length > ITEM_LIMIT) {
				throw new Error(`A busca excedeu o limite de segurança de ${ITEM_LIMIT} posts; nenhum lote foi enviado.`);
			}
		}
		aoProgredir?.(novos.length, paginas);

		if (!page.more) {
			alcancouFim = true;
			break;
		}
		if (!page.nextCursor) throw new Error('A paginação do Instagram está incompleta; nenhum lote foi enviado.');
		if (seenCursors.has(page.nextCursor)) {
			throw new Error('O Instagram repetiu um cursor de paginação. A busca foi interrompida para evitar duplicação.');
		}
		seenCursors.add(page.nextCursor);
		cursor = page.nextCursor;
	}

	if (!alcancouFim && paginas >= PAGE_LIMIT) {
		throw new Error(`A busca atingiu o limite de segurança de ${PAGE_LIMIT} páginas antes do fim; nenhum lote foi enviado.`);
	}
	return { novos, paginas, alcancouFim };
}

function normalizePublishedDate(value: string): string {
	if (!value.trim()) return '';
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function canonicalInstagramUrl(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error('O post do Instagram não contém um link válido.');
	}
	if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname)) {
		throw new Error('O post não pertence a instagram.com.');
	}
	const match = url.pathname.match(/^\/(p|reel|reels)\/([A-Za-z0-9_-]{1,64})\/?$/);
	if (!match) throw new Error('O link do post do Instagram não contém um shortcode válido.');
	const route = match[1] === 'reels' ? 'reel' : match[1];
	return `https://www.instagram.com/${route}/${match[2]}/`;
}

function cleanNoteName(name: string): string {
	const cleaned = String(name || '')
		.replace(/[\\/:*?"<>|#\[\]^\u0000-\u001f\u007f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^[.\s]+/, '')
		.trim();
	const encoder = new TextEncoder();
	let result = '';
	let units = 0;
	let bytes = 0;
	for (const character of cleaned) {
		const point = character.codePointAt(0)!;
		if (point >= 0xd800 && point <= 0xdfff) continue;
		const characterUnits = character.length;
		const characterBytes = encoder.encode(character).length;
		if (units + characterUnits > BRIDGE_NAME_MAX_UNITS || bytes + characterBytes > BRIDGE_NAME_MAX_BYTES) break;
		result += character;
		units += characterUnits;
		bytes += characterBytes;
	}
	return result.replace(/^[.\s]+/, '').trim() || 'Instagram saved post';
}

/** Convert one normalized post into the same `{nome, conteudo, source}` shape the bridge accepts for X. */
export function instagramParaNota(post: InstagramSavedPost): InstagramBridgeNote {
	const source = canonicalInstagramUrl(post.url);
	const text = String(post.texto || '').trim();
	const username = String(post.autor || '').trim();
	const authorName = String(post.nomeAutor || username).trim();
	const date = normalizePublishedDate(post.criadoEm || '');
	const media = Array.isArray(post.midia)
		? post.midia.map(instagramImageUrl).filter((url, index, all) => !!url && all.indexOf(url) === index)
		: [];
	const title = text.slice(0, 80) + (text.length > 80 ? '…' : '') || username || post.id;
	const description = text.slice(0, 300);
	const yaml = (value: string) => JSON.stringify(value ?? '');
	const nameBase = text.replace(/\s+/g, ' ').slice(0, 60) || post.id || 'saved post';
	const name = cleanNoteName(`@${username || 'Instagram'} - ${nameBase}`);
	const frontmatter = [
		'---',
		`title: ${yaml(title)}`,
		`source: ${yaml(source)}`,
		`author:\n  - ${yaml(authorName || username)}`,
		`published: ${date || yaml('')}`,
		`description: ${yaml(description)}`,
		'tags:\n  - "instagram-saved"',
		...(media.length ? [`image: ${yaml(media[0])}`] : []),
		'---',
		'',
		text,
		'',
		...media.map((url) => `![](${url})`),
		...(media.length ? ['', '## Mídia', '', ...media.map((url) => `- ${url}`)] : []),
		'',
		`[Ver no Instagram](${source})${username ? ` · @${username}` : ''}`,
		'',
	].join('\n');
	return { nome: name, conteudo: frontmatter, source };
}

function validTransportCounts(
	value: unknown,
	expected: number,
): value is { criados: number; pulados: number; erros: number; avisos?: unknown } {
	if (!isRecord(value)) return false;
	const counts = [value.criados, value.pulados, value.erros];
	if (!counts.every((count) => Number.isSafeInteger(count) && Number(count) >= 0)) return false;
	return counts.reduce<number>((total, count) => total + Number(count), 0) === expected;
}

function responseError(response: Response): string {
	if (response.status === 401 || response.status === 403) return 'A autenticação da ponte Corebrain falhou. Confira o token de pareamento.';
	if (response.status === 404) return 'A ponte Corebrain não reconhece a rota de importação do Instagram. Atualize e recarregue o plugin Corebrain.';
	return `A ponte Corebrain respondeu ${response.status}.`;
}

function safeBridgeWarnings(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((warning): warning is string => typeof warning === 'string')
		.map((warning) => warning.trim().slice(0, 300))
		.filter(Boolean)
		.slice(0, 10);
}

/**
 * Sends bounded batches through the authenticated bridge. Posts arrive newest
 * first; writing the oldest batch first lets the plugin's reverse batch writer
 * preserve the overall feed order.
 */
export async function enviarSalvosInstagram(
	posts: InstagramSavedPost[],
	pasta = DEFAULT_INSTAGRAM_SAVED_FOLDER,
	aoProgredir?: InstagramImportProgress,
	deveCancelar?: () => boolean,
): Promise<InstagramTransportResult> {
	if (!Array.isArray(posts)) throw new Error('A lista de posts do Instagram é inválida.');
	if (!posts.length) return { criados: 0, pulados: 0, erros: 0 };

	// Fail before the first write if any known local payload cannot be serialized.
	const notas = posts.map(instagramParaNota);
	const result: InstagramTransportResult = { criados: 0, pulados: 0, erros: 0 };
	const warnings: string[] = [];
	let processed = 0;
	let end = posts.length;
	while (end > 0) {
		if (deveCancelar?.()) {
			result.cancelado = true;
			warnings.push(`Importação cancelada; ${posts.length - processed} posts ainda não foram enviados.`);
			break;
		}
		const start = Math.max(0, end - BRIDGE_CHUNK_SIZE);
		const chunk = notas.slice(start, end);
		const controller = new AbortController();
		let requestTimer: ReturnType<typeof setTimeout> | undefined;
		const requestTimeout = new Promise<never>((_, reject) => {
			requestTimer = setTimeout(() => {
				controller.abort();
				reject(new Error('bridge request timeout'));
			}, BRIDGE_REQUEST_TIMEOUT_MS);
		});
		try {
			const response = await Promise.race([
				fetchBridge('/instagram-saved', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ pasta, bookmarks: chunk }),
					signal: controller.signal,
				}),
				requestTimeout,
			]);
			if (!response.ok) {
				warnings.push(responseError(response));
				if ([401, 403, 404].includes(response.status)) {
					result.erros += posts.length - processed;
					processed += chunk.length;
					aoProgredir?.(processed, posts.length);
					break;
				}
				result.erros += chunk.length;
			} else {
				let body: unknown;
				try {
					body = await Promise.race([response.json(), requestTimeout]);
				} catch {
					body = null;
				}
				if (!validTransportCounts(body, chunk.length)) {
					warnings.push('A ponte Corebrain retornou contagens inválidas para um lote; tente sincronizar de novo para conferir os duplicados.');
					result.erros += chunk.length;
				} else {
					result.criados += body.criados;
					result.pulados += body.pulados;
					result.erros += body.erros;
					warnings.push(...safeBridgeWarnings(body.avisos));
					if (body.erros > 0) warnings.push(`A ponte Corebrain reportou ${body.erros} erro(s) no lote.`);
				}
			}
		} catch {
			warnings.push('Não foi possível enviar um lote à ponte Corebrain; tente sincronizar de novo para conferir os duplicados.');
			result.erros += chunk.length;
		} finally {
			if (requestTimer) clearTimeout(requestTimer);
		}
		if (end === start) break;
		processed += chunk.length;
		end = start;
		aoProgredir?.(processed, posts.length);
	}

	if (warnings.length) result.avisos = warnings;
	return result;
}
