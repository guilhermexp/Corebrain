// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { getPropertiesFromDOM } from './popup';

/**
 * A description virou textarea (colapsavel). Se o seletor de leitura nao incluir
 * textarea, ela some de TODO clip sem erro nenhum — e o tipo de regressao que
 * so aparece quando voce ja perdeu notas.
 */
function prop(nome: string, valor: string, tag: 'input' | 'textarea') {
	const div = document.createElement('div');
	div.className = 'metadata-property';
	const val = document.createElement('div');
	val.className = 'metadata-property-value';
	const campo = document.createElement(tag) as HTMLInputElement;
	campo.id = nome;
	campo.value = valor;
	if (tag === 'input') campo.type = 'text';
	val.appendChild(campo);
	div.appendChild(val);
	document.body.appendChild(div);
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('getPropertiesFromDOM', () => {
	test('captura a description mesmo sendo textarea', () => {
		prop('title', 'Recollect', 'input');
		prop('description', 'Open source bookmark manager', 'textarea');
		const props = getPropertiesFromDOM();
		expect(props.map((p) => p.name)).toEqual(['title', 'description']);
		expect(props.find((p) => p.name === 'description')?.value).toBe('Open source bookmark manager');
	});

	test('mantem a ordem das propriedades do template', () => {
		prop('title', 'a', 'input');
		prop('description', 'b', 'textarea');
		prop('tags', 'c', 'input');
		expect(getPropertiesFromDOM().map((p) => p.name)).toEqual(['title', 'description', 'tags']);
	});

	test('checkbox continua devolvendo booleano', () => {
		const div = document.createElement('div');
		div.className = 'metadata-property';
		const c = document.createElement('input');
		c.type = 'checkbox'; c.id = 'lido'; c.checked = true;
		div.appendChild(c); document.body.appendChild(div);
		expect(getPropertiesFromDOM()[0].value).toBe(true);
	});
});
