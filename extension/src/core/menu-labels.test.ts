import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Rotulo sem entrada de i18n vira item de menu VAZIO — mesma falha muda do
 * icone que nao estava registrado: existe no DOM, invisivel na tela.
 */
const chaves = ['syncXBookmarks', 'addToObsidian', 'copyToClipboard', 'saveFile'];

describe('rotulos do menu existem nos locales', () => {
	for (const loc of ['en', 'pt_BR']) {
		test(loc, () => {
			const msgs = JSON.parse(readFileSync(new URL(`../_locales/${loc}/messages.json`, import.meta.url), 'utf8'));
			const faltando = chaves.filter((k) => !msgs[k]?.message);
			expect(faltando).toEqual([]);
		});
	}
});
