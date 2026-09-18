import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { icons } from './icons';

/**
 * O projeto so empacota um subconjunto do lucide. Um data-lucide que nao esteja
 * registrado aqui renderiza VAZIO — o botao existe no DOM, e some da tela sem
 * nenhum erro. Foi o que aconteceu com o botao de sync (icone "bookmark").
 */
function usadosNoHtml(arquivo: string): string[] {
	const html = readFileSync(new URL(`../${arquivo}`, import.meta.url), 'utf8');
	return [...html.matchAll(/data-lucide="([\w-]+)"/g)].map((m) => m[1]);
}

// lucide usa PascalCase no registro e kebab-case no atributo
const registrados = new Set(
	Object.keys(icons).map((k) =>
		k
			.replace(/([a-z])([A-Z])/g, '$1-$2')
			.replace(/([a-zA-Z])(\d)/g, '$1-$2') // Trash2 -> trash-2, PictureInPicture2 -> ...-2
			.toLowerCase(),
	),
);

describe('icones declarados no HTML existem no bundle', () => {
	for (const arquivo of ['popup.html', 'settings.html', 'side-panel.html']) {
		test(arquivo, () => {
			const faltando = usadosNoHtml(arquivo).filter((i) => !registrados.has(i));
			expect(faltando).toEqual([]);
		});
	}
});

describe('icones do sync', () => {
	test('bookmark esta registrado', () => {
		expect(registrados.has('bookmark')).toBe(true);
	});
});
