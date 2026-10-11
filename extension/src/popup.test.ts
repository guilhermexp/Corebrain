// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const popupMarkup = readFileSync(resolve('src/popup.html'), 'utf8');

beforeAll(() => {
	document.documentElement.innerHTML = popupMarkup
		.replace(/^<!DOCTYPE html>/i, '')
		.replace(/<html[^>]*>|<\/html>/gi, '');
});

describe('compact popup', () => {
	it('keeps the Corebrain brand and settings reachable in the header', () => {
		expect(document.querySelector('.compact-popup-brand')?.getAttribute('aria-label')).toContain('Corebrain');
		expect(document.querySelector('#open-settings')).not.toBeNull();
	});

	it('offers labeled Instagram and X sync actions and a disabled capture action until ready', () => {
		expect(document.querySelector('#instagram-sync')?.textContent).toMatch(/sincronizar instagram/i);
		expect(document.querySelector('#x-sync')?.textContent).toMatch(/sincronizar x/i);
		expect((document.querySelector('#clip-btn') as HTMLButtonElement | null)?.disabled).toBe(true);
		expect((document.querySelector('#more-btn') as HTMLButtonElement | null)?.disabled).toBe(true);
	});

	it('keeps capture options collapsed while preserving template, folder and vault controls', () => {
		const options = document.querySelector<HTMLDetailsElement>('#capture-options');
		expect(options).not.toBeNull();
		expect(options?.open).toBe(false);
		expect(options?.querySelector('#template-select')).not.toBeNull();
		expect(options?.querySelector('#path-name-field')).not.toBeNull();
		expect(options?.querySelector('#vault-select')).not.toBeNull();
	});

	it('hides populated extraction fields without removing IDs used by capture handlers', () => {
		const captureData = document.querySelector<HTMLElement>('#capture-data');
		expect(captureData?.hidden).toBe(true);
		for (const id of ['note-name-field', 'note-content-field', 'metadata-properties']) {
			expect(captureData?.querySelector(`#${id}`), `${id} remains available to capture code`).not.toBeNull();
		}
	});

	it('keeps sync progress and errors outside closed capture options', () => {
		for (const id of ['x-sync-status', 'instagram-sync-status', 'popup-error']) {
			const element = document.getElementById(id);
			expect(element).not.toBeNull();
			expect(element?.closest('#capture-controls')).toBeNull();
		}
	});

	it('uses unique DOM IDs for the preserved handlers', () => {
		const ids = Array.from(document.querySelectorAll('[id]'), (element) => element.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('does not expose a separate unguarded file-sharing capture action', () => {
		expect(document.querySelector('.share-content')).toBeNull();
	});

	it('places capture first and keeps interpreter failures outside collapsed details', () => {
		const capture = document.querySelector('#action-buttons');
		const sync = document.querySelector('.compact-sync-actions');
		expect(capture?.compareDocumentPosition(sync!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
		expect(document.querySelector('#interpreter-error')?.closest('details')).toBeNull();
	});
});

 it('declares UTF-8 before localized text and hides extra controls initially',()=>{
 expect(document.querySelector('meta[charset]')?.getAttribute('charset')).toBe('UTF-8');
 expect(document.getElementById('capture-controls')?.hidden).toBe(true);
 });
