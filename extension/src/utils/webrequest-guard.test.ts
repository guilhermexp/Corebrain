import { describe, test, expect } from 'vitest';
import { precisaFallbackWebRequest } from './webrequest-guard';

/**
 * Regressao real: ao adicionar a permissao `webRequest` (pro sync de bookmarks),
 * o Chrome passou a entrar num fallback de Firefox/Safari que registra listener
 * 'blocking' — proibido no MV3. Antes so nao quebrava porque o objeto nem existia.
 */
describe('precisaFallbackWebRequest', () => {
	test('Chrome (tem declarativeNetRequest) NAO usa o fallback blocking', () => {
		expect(precisaFallbackWebRequest({ webRequest: {}, declarativeNetRequest: {} })).toBe(false);
	});

	test('Firefox/Safari (sem declarativeNetRequest) usa o fallback', () => {
		expect(precisaFallbackWebRequest({ webRequest: {}, declarativeNetRequest: undefined })).toBe(true);
	});

	test('sem webRequest nenhum, nao tenta registrar nada', () => {
		expect(precisaFallbackWebRequest({ webRequest: undefined, declarativeNetRequest: undefined })).toBe(false);
	});
});
