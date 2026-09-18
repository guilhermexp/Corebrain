/**
 * Decide se este browser precisa do fallback de webRequest 'blocking'.
 *
 * Guard por capacidade, nao por existencia: quem tem declarativeNetRequest
 * (Chrome) ja resolve por regra DNR, e registrar listener 'blocking' no MV3 e
 * rejeitado ("webRequestBlocking is only allowed for ExtensionInstallForcelist").
 *
 * Antes o codigo so checava se `browser.webRequest` existia. Isso funcionava por
 * acidente: a extensao nao pedia a permissao `webRequest`, entao o objeto nem
 * aparecia no Chrome. Ao pedir a permissao (pro sync de bookmarks do X), o
 * caminho errado ligou sozinho.
 */
export function precisaFallbackWebRequest(amb: {
	webRequest?: unknown;
	declarativeNetRequest?: unknown;
}): boolean {
	return !!amb.webRequest && !amb.declarativeNetRequest;
}
