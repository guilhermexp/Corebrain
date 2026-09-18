/**
 * Sincroniza os bookmarks do X usando a sessao que ja existe no browser.
 *
 * Por que nao a API oficial: ela limita a leitura a ~99 bookmarks. O app web do X
 * usa um endpoint GraphQL interno sem esse teto, e a extensao — rodando no browser
 * logado — consegue chamar o mesmo endpoint com o cookie da sessao.
 */

import { debugLog } from './debug';
import { fetchBridge, isCompatibleBridge } from './bridge-settings';

// bearer publico do app web do X (nao e segredo; e o mesmo que a pagina envia)
const BEARER =
	'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

// ultimo queryId conhecido. O X troca isso a cada deploy, entao serve so como
// rede de seguranca — o caminho normal e descobrir na hora (ver descobrirQueryId).
const QUERY_ID_FALLBACK = 'aqjes8lRHRFG0HUglVTfNg';
const QUERY_ID_CACHE_KEY = 'x_bookmarks_query_id';

export interface XBookmark {
	id: string;
	autor: string;
	nomeAutor: string;
	texto: string;
	url: string;
	criadoEm: string;
	midia: string[];
	links: string[];
}

export interface ResultadoSync {
	novos: XBookmark[];
	paginas: number;
	alcancouFim: boolean;
}

export const DEFAULT_X_BOOKMARK_FOLDER = 'Clippings';

/** A failed item must remain eligible for the next incremental sync. */
export function podeAvancarMarcador(
	total: number,
	salvos: number,
	pulados: number,
	erros: number,
	alcancouFim = false,
): boolean {
	return alcancouFim && total > 0 && erros === 0 && salvos + pulados === total;
}

/** Authentication errors must not be mistaken for an unavailable plugin. */
export class BridgeRequestError extends Error {
	readonly status: number;

	constructor(status: number) {
		super(`Corebrain bridge rejected the request (${status}).`);
		this.name = 'BridgeRequestError';
		this.status = status;
	}
}

export class BridgeAuthenticationError extends BridgeRequestError {
	constructor(status: number) {
		super(status);
		this.message = `Corebrain bridge authentication failed (${status}). Check the pairing token.`;
		this.name = 'BridgeAuthenticationError';
	}
}

async function pegarCookie(nome: string): Promise<string | null> {
	const c = await chrome.cookies.get({ url: 'https://x.com', name: nome });
	return c?.value || null;
}

export async function estaLogadoNoX(): Promise<boolean> {
	// ct0 (csrf) so existe em sessao autenticada; auth_token e httpOnly mas visivel via API
	const [ct0, auth] = await Promise.all([pegarCookie('ct0'), pegarCookie('auth_token')]);
	return !!(ct0 && auth);
}

/**
 * Observa as chamadas que o proprio x.com faz e guarda o queryId de Bookmarks.
 *
 * Tentei antes varrer os bundles JS a partir do HTML: nao funciona, porque o
 * bundle da rota de bookmarks e carregado sob demanda e nao aparece no HTML
 * inicial. Capturar a request real e o unico jeito confiavel — basta o usuario
 * abrir x.com/i/bookmarks uma vez pra ficarmos sempre com o ID vigente.
 */
export function observarQueryId(): void {
	const wr = (globalThis as any).chrome?.webRequest;
	if (!wr?.onBeforeRequest) return;
	wr.onBeforeRequest.addListener(
		(d: { url: string }) => {
			const m = d.url.match(/\/i\/api\/graphql\/([\w-]+)\/Bookmarks/);
			if (m) chrome.storage.local.set({ [QUERY_ID_CACHE_KEY]: { id: m[1], em: Date.now() } });
		},
		{ urls: ['*://x.com/i/api/graphql/*', '*://twitter.com/i/api/graphql/*'] },
	);
}

async function descobrirQueryId(): Promise<string> {
	const cache = await chrome.storage.local.get(QUERY_ID_CACHE_KEY);
	const salvo = cache[QUERY_ID_CACHE_KEY] as { id: string; em: number } | undefined;
	if (salvo?.id) return salvo.id;
	return QUERY_ID_FALLBACK;
}

const FEATURES = {
	graphql_timeline_v2_bookmark_timeline: true,
	responsive_web_graphql_exclude_directive_enabled: true,
	verified_phone_label_enabled: false,
	creator_subscriptions_tweet_preview_api_enabled: true,
	responsive_web_graphql_timeline_navigation_enabled: true,
	responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
	communities_web_enable_tweet_community_results_fetch: true,
	c9s_tweet_anatomy_moderator_badge_enabled: true,
	articles_preview_enabled: true,
	tweetypie_unmention_optimization_enabled: true,
	responsive_web_edit_tweet_api_enabled: true,
	graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
	view_counts_everywhere_api_enabled: true,
	longform_notetweets_consumption_enabled: true,
	responsive_web_twitter_article_tweet_consumption_enabled: true,
	tweet_awards_web_tipping_enabled: false,
	creator_subscriptions_quote_tweet_preview_enabled: false,
	freedom_of_speech_not_reach_fetch_enabled: true,
	standardized_nudges_misinfo: true,
	tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
	rweb_video_timestamps_enabled: true,
	longform_notetweets_rich_text_read_enabled: true,
	longform_notetweets_inline_media_enabled: true,
	responsive_web_enhance_cards_enabled: false,
};

function extrairTweet(entry: any): XBookmark | null {
	const res = entry?.content?.itemContent?.tweet_results?.result;
	const alvo = res?.tweet || res;
	const legacy = alvo?.legacy;
	if (!legacy) return null;

	const userRes = alvo?.core?.user_results?.result;
	const autor = userRes?.core?.screen_name || userRes?.legacy?.screen_name || '';
	const nomeAutor = userRes?.core?.name || userRes?.legacy?.name || autor;

	const midia: string[] = (legacy.extended_entities?.media || legacy.entities?.media || [])
		.map((m: any) => m.media_url_https || m.media_url)
		.filter(Boolean);

	const links: string[] = (legacy.entities?.urls || [])
		.map((u: any) => u.expanded_url)
		.filter(Boolean);

	// full_text vem truncado em thread longa; note_tweet traz a versao inteira
	const textoLongo = alvo?.note_tweet?.note_tweet_results?.result?.text;
	const id = legacy.id_str || alvo?.rest_id || '';

	return {
		id,
		autor,
		nomeAutor,
		texto: textoLongo || legacy.full_text || '',
		url: autor && id ? `https://x.com/${autor}/status/${id}` : '',
		criadoEm: legacy.created_at || '',
		midia,
		links,
	};
}

async function buscarPagina(queryId: string, ct0: string, cursor?: string) {
	const variables: Record<string, unknown> = { count: 100, includePromotedContent: false };
	if (cursor) variables.cursor = cursor;

	const url =
		`https://x.com/i/api/graphql/${queryId}/Bookmarks` +
		`?variables=${encodeURIComponent(JSON.stringify(variables))}` +
		`&features=${encodeURIComponent(JSON.stringify(FEATURES))}`;

	const resp = await fetch(url, {
		credentials: 'include',
		headers: {
			authorization: `Bearer ${BEARER}`,
			'x-csrf-token': ct0,
			'x-twitter-active-user': 'yes',
			'x-twitter-auth-type': 'OAuth2Session',
			'content-type': 'application/json',
		},
	});

	if (!resp.ok) {
		const corpo = await resp.text().catch(() => '');
		// 404 aqui quase sempre significa que o X rotacionou o queryId. Sem esta
		// mensagem o sync quebraria em silencio semanas depois de instalado.
		if (resp.status === 404 || /operation|persisted query/i.test(corpo)) {
			throw new Error(
				'O X mudou o endereco da API de bookmarks. Abra x.com/i/bookmarks uma vez e clique em sincronizar de novo.',
			);
		}
		if (resp.status === 429) {
			throw new Error('O X limitou as requisicoes (429). Espere alguns minutos e sincronize de novo.');
		}
		throw new Error(`X respondeu ${resp.status}: ${corpo.slice(0, 200)}`);
	}

	const json: any = await resp.json();
	const instrucoes = json?.data?.bookmark_timeline_v2?.timeline?.instructions || [];
	const entries = instrucoes.flatMap((i: any) => i.entries || []);

	const bookmarks = entries
		.filter((e: any) => String(e.entryId || '').startsWith('tweet-'))
		.map(extrairTweet)
		.filter(Boolean) as XBookmark[];

	const proximo = entries.find((e: any) => String(e.entryId || '').startsWith('cursor-bottom'));

	return { bookmarks, cursor: proximo?.content?.value as string | undefined };
}

function limparTexto(s: string): string {
	return (s || '').replace(/https:\/\/t\.co\/\w+/g, '').replace(/\s+/g, ' ').trim();
}

function nomeDaNota(b: XBookmark): string {
	const base = limparTexto(b.texto).slice(0, 60) || b.id;
	return `@${b.autor} - ${base}`.replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
}

export function bookmarkParaNota(b: XBookmark): { nome: string; conteudo: string; source: string } {
	const texto = limparTexto(b.texto);
	const data = (() => {
		const d = new Date(b.criadoEm);
		return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
	})();
	const y = (v: string) => JSON.stringify(v ?? '');

	const fm = [
		'---',
		`title: ${y(texto.slice(0, 80) + (texto.length > 80 ? '…' : '') || b.autor)}`,
		`source: ${y(b.url)}`,
		// texto puro, sem [[ ]]: wikilink de autor cria uma nota fantasma por pessoa
		// (eram 1163 no grafo do vault). E passa pelo y() como todo campo: nome com
		// aspas interpolado cru quebraria o YAML da nota inteira.
		`author:\n  - ${y(b.nomeAutor || b.autor)}`,
		`published: ${data}`,
		`created: ${data}`,
		`description: ${y(texto.slice(0, 300))}`,
		'tags:\n  - "x-bookmark"',
		...(b.midia.length ? [`image: ${y(b.midia[0])}`] : []),
		'---',
		'',
		texto,
		'',
		...b.midia.map((m) => `![](${m})`),
		...(b.links.length ? ['', '## Links', '', ...b.links.map((l) => `- ${l}`)] : []),
		'',
		`[Ver no X](${b.url}) · @${b.autor}`,
		'',
	];
	// source vai junto: e por ele que o plugin deduplica, nao pelo nome do
	// arquivo (dois tweets distintos podem gerar o mesmo nome).
	return { nome: nomeDaNota(b), conteudo: fm.join('\n'), source: b.url };
}

/**
 * Monta a URI do Obsidian para uma nota. Funcao pura de proposito: o sync roda
 * no service worker, que NAO tem DOM — importar o modulo de UI (saveToObsidian)
 * aqui quebrava com "document is not defined", porque ele puxa i18n/clipboard.
 */
export function montarUriObsidian(
	nome: string,
	conteudo: string,
	pasta: string,
	vault: string,
): string {
	const caminho = pasta && !pasta.endsWith('/') ? `${pasta}/` : pasta;
	const arquivo = nome.replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
	return (
		`obsidian://new?file=${encodeURIComponent(caminho + arquivo)}` +
		'&silent=true' + // em lote nunca abre a nota
		(vault ? `&vault=${encodeURIComponent(vault)}` : '') +
		`&content=${encodeURIComponent(conteudo)}`
	);
}

export type Duplicata = { existe: boolean; caminho: string | null };

function authError(response: Response): BridgeAuthenticationError | null {
	return response.status === 401 || response.status === 403 ? new BridgeAuthenticationError(response.status) : null;
}

/**
 * Pergunta ao plugin se esta URL ja esta na galeria.
 *
 * Devolve null quando NAO DA PRA SABER (Obsidian fechado, plugin desligado,
 * porta trocada). Quem chama deve SEGUIR nesse caso: barrar o clip porque a
 * checagem falhou quebraria a extensao toda vez que o Obsidian nao estivesse
 * aberto — o oposto do que o usuario quer.
 */
export async function jaNaGaleria(url: string): Promise<Duplicata | null> {
	if (!url) return null;
	try {
		const r = await fetchBridge(`/tem?url=${encodeURIComponent(url)}`, { method: 'GET' });
		const erroAuth = authError(r);
		if (erroAuth) throw erroAuth;
		// A transient bridge-side read failure is still "unknown"; the actual
		// clip request below will surface any explicit write rejection. Auth is
		// different and is never swallowed (see authError above).
		if (!r.ok) return null;
		const j = await r.json();
		return { existe: !!j.existe, caminho: typeof j.caminho === 'string' ? j.caminho : null };
	} catch (e) {
		if (e instanceof BridgeAuthenticationError) throw e;
		return null;
	}
}

export async function pluginDisponivel(): Promise<boolean> {
	try {
		const r = await fetchBridge('/ping', { method: 'GET' });
		const erroAuth = authError(r);
		if (erroAuth) throw erroAuth;
		if (!r.ok) throw new BridgeRequestError(r.status);
		const body = await r.json().catch(() => null);
		if (!isCompatibleBridge(body)) {
			const error = new BridgeRequestError(r.status);
			error.message = 'Corebrain bridge protocol is unsupported. Update both components.';
			throw error;
		}
		return true;
	} catch (e) {
		if (e instanceof BridgeRequestError) throw e;
		return false;
	}
}

/**
 * Caminho preferido: manda tudo de uma vez pro plugin do Obsidian, que escreve
 * com a API do vault.
 *
 * O caminho antigo (uma URI `obsidian://` por nota) fazia o macOS ATIVAR o
 * Obsidian a cada nota — milhares de roubos de foco seguidos, impossivel usar o
 * computador durante o sync. Um POST resolve com zero ativacoes.
 */
export async function enviarPelaPonte(
	bookmarks: XBookmark[],
	pasta = DEFAULT_X_BOOKMARK_FOLDER,
): Promise<{ criados: number; pulados: number; erros: number }> {
	const r = await fetchBridge('/x-bookmarks', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ pasta, bookmarks: bookmarks.map(bookmarkParaNota) }),
	});
	const erroAuth = authError(r);
	if (erroAuth) throw erroAuth;
	if (!r.ok) throw new Error(`plugin respondeu ${r.status}`);
	return await r.json();
}

/**
 * Clip avulso pela ponte, sem `obsidian://`.
 *
 * Pela URI o macOS ativa o Obsidian e abre a nota: voce perde a pagina que
 * estava lendo a cada clip. Por aqui o plugin escreve com a API do vault e
 * nada ganha foco.
 *
 * Devolve null quando NAO DA PRA SABER (Obsidian fechado, plugin desligado,
 * porta trocada). Quem chama cai no `obsidian://` nesse caso — sem isso a
 * extensao pararia de funcionar com o Obsidian fechado.
 */
export async function clipPelaPonte(
	conteudo: string,
	nome: string,
	pasta: string,
): Promise<{ caminho: string; duplicata: boolean } | null> {
	try {
		const r = await fetchBridge('/clip', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ conteudo, nome, pasta }),
		});
		const erroAuth = authError(r);
		if (erroAuth) throw erroAuth;
		if (!r.ok) throw new BridgeRequestError(r.status);
		const j = await r.json();
		if (!j || !j.ok) return null;
		return { caminho: String(j.caminho || ''), duplicata: !!j.duplicata };
	} catch (e) {
		if (e instanceof BridgeRequestError) throw e;
		return null;
	}
}

/**
 * Fallback: grava nota a nota via `obsidian://`. Usado so quando o plugin nao
 * esta disponivel — rouba foco a cada nota, entao nao serve pra lote grande.
 */
export async function salvarComoNotas(
	bookmarks: XBookmark[],
	pasta = DEFAULT_X_BOOKMARK_FOLDER,
	vault: string,
	abrir: (url: string) => Promise<void>,
	aoProgredir?: (feitos: number, total: number) => void,
	pausaMs = 120,
): Promise<{ salvos: number; erros: number }> {
	let salvos = 0;
	let erros = 0;

	for (const b of bookmarks) {
		try {
			const { nome, conteudo } = bookmarkParaNota(b);
			await abrir(montarUriObsidian(nome, conteudo, pasta, vault));
			salvos++;
		} catch (e) {
			erros++;
			debugLog('XBookmarks', 'falhou ao salvar', b.id, e);
		}
		aoProgredir?.(salvos + erros, bookmarks.length);
		if (pausaMs) await new Promise((r) => setTimeout(r, pausaMs));
	}
	return { salvos, erros };
}

/**
 * Pagina do mais recente pro mais antigo e para ao reencontrar `ultimoIdConhecido`
 * — e o que torna o sync incremental em vez de rebaixar tudo toda vez.
 */
export async function buscarBookmarks(
	ultimoIdConhecido?: string,
	aoProgredir?: (qtd: number, pagina: number) => void,
	maxPaginas = 50,
	deveCancelar?: () => boolean,
): Promise<ResultadoSync> {
	const ct0 = await pegarCookie('ct0');
	if (!ct0) throw new Error('Nao encontrei a sessao do X. Faca login em x.com e tente de novo.');

	const queryId = await descobrirQueryId();
	const novos: XBookmark[] = [];
	let cursor: string | undefined;
	let pagina = 0;
	let alcancouFim = false;

	while (pagina < maxPaginas) {
		if (deveCancelar?.()) break;
		const r = await buscarPagina(queryId, ct0, cursor);
		pagina++;

		if (!r.bookmarks.length) {
			alcancouFim = true;
			break;
		}

		const idx = ultimoIdConhecido ? r.bookmarks.findIndex((b) => b.id === ultimoIdConhecido) : -1;
		if (idx >= 0) {
			novos.push(...r.bookmarks.slice(0, idx));
			alcancouFim = true;
			break;
		}

		novos.push(...r.bookmarks);
		aoProgredir?.(novos.length, pagina);

		if (!r.cursor || r.cursor === cursor) {
			alcancouFim = true;
			break;
		}
		cursor = r.cursor;
	}

	return { novos, paginas: pagina, alcancouFim };
}
