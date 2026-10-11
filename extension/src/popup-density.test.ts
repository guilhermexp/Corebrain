// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { compile } from 'sass';

function declarationsFor(css: string, selectorMatch: (selector: string) => boolean): string {
	const blocks = css.matchAll(/([^{}]+)\{([^{}]*)\}/g);
	for (const [, selectorGroup, declarations] of blocks) {
		if (selectorGroup.split(',').some((selector) => selectorMatch(selector.trim()))) return declarations;
	}
	return '';
}

it('keeps the popup small without a second card outline', () => {
	document.documentElement.id='popup';
	const css = compile('src/styles/popup.scss').css;
	document.head.innerHTML=`<style>${css}</style>`;
	document.body.id='popup-container';document.body.className='compact-popup';
	document.body.innerHTML='<div class="compact-popup-brand"><h1>Guarde</h1></div><div id="action-buttons" class="action-buttons"><button id="clip-btn">Salvar</button><button id="more-btn">Mais</button></div><a class="compact-sync-action">Instagram</a>';
	expect(getComputedStyle(document.body).width).toBe('220px');
	expect(getComputedStyle(document.body).backgroundColor).toBe('rgba(0, 0, 0, 0)');
 expect(getComputedStyle(document.body).borderTopWidth).toBe('0px');
	expect(getComputedStyle(document.querySelector('h1')!).fontSize).toBe('17px');
	expect(getComputedStyle(document.querySelector('#clip-btn')!).height).toBe('32px');
	expect(getComputedStyle(document.querySelector('.compact-sync-action')!).fontSize).toBe('13px');

	// Floating iframe surfaces keep a transparent document and one rounded body.
	// This CSS alone does not control the native toolbar popup window shape.
	expect(getComputedStyle(document.documentElement).backgroundColor).toBe('rgba(0, 0, 0, 0)');
	expect(getComputedStyle(document.body).borderRadius).toBe('22px');
	expect(getComputedStyle(document.querySelector('#action-buttons')!).borderRadius).toBe('14px');
	expect(getComputedStyle(document.querySelector('.compact-sync-action')!).borderRadius).toBe('12px');

	// jsdom does not model keyboard focus rendering. Verify the compiled selectors
	// keep the focus ring on the joined button group, not either child button.
	for (const buttonId of ['clip-btn', 'more-btn']) {
		const childFocus = declarationsFor(css, (selector) =>
			selector.includes(`#${buttonId}:focus`) && selector.includes('.compact-popup'),
		);
		expect(childFocus).toMatch(/\boutline\s*:\s*none\s*;/);
		expect(childFocus).toMatch(/\bbox-shadow\s*:\s*none\s*;/);
	}
	const groupFocus = declarationsFor(css, (selector) =>
		selector.includes('#action-buttons:has(:focus-visible)') && selector.includes('.compact-popup'),
	);
	expect(groupFocus).not.toBe('');
	expect(groupFocus).toMatch(/(?:\boutline\s*:\s*(?!none\b)[^;]+|\bbox-shadow\s*:\s*(?!none\b)[^;]+)/);

	// In the floating iframe, content remains intrinsically sized and the document
	// itself can scroll when the host must clamp the iframe to the viewport.
	document.documentElement.classList.add('is-floating', 'is-embedded');
	expect(getComputedStyle(document.documentElement).maxHeight).toBe('none');
	expect(getComputedStyle(document.documentElement).overflowY).toBe('auto');
	expect(getComputedStyle(document.body).maxHeight).toBe('none');
	expect(getComputedStyle(document.body).overflow).toBe('visible');
});

it('fills the independent window with one surface, not a rounded card over a square', () => {
 document.documentElement.id='popup';document.documentElement.className='is-window';
 document.head.innerHTML=`<style>${compile('src/styles/popup.scss').css}</style>`;
 document.body.id='popup-container';document.body.className='compact-popup';
 expect(getComputedStyle(document.documentElement).width).toBe('100%');
 expect(getComputedStyle(document.body).width).toBe('100%');
 expect(getComputedStyle(document.body).borderRadius).toBe('0px');
 document.documentElement.className='';
});
