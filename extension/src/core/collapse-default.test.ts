// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { estadoInicialColapsado } from './popup';

describe('estado inicial do bloco de propriedades', () => {
	test('sem preferencia salva, vem colapsado', () => {
		expect(estadoInicialColapsado(undefined)).toBe(true);
	});

	test('se o usuario deixou aberto, respeita', () => {
		expect(estadoInicialColapsado(false)).toBe(false);
	});

	test('se o usuario deixou colapsado, respeita', () => {
		expect(estadoInicialColapsado(true)).toBe(true);
	});

	test('valor invalido no storage cai no padrao, nao quebra', () => {
		expect(estadoInicialColapsado(null)).toBe(true);
		expect(estadoInicialColapsado('sim')).toBe(true);
	});
});
