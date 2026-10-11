// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toggleFloatingPanel } from './floating-panel';

const EXTENSION_URL = 'chrome-extension://corebrain-test/popup.html?context=iframe&surface=floating';
const HOST_ID = 'corebrain-floating-panel';

function host(): HTMLElement {
	const element = document.getElementById(HOST_ID);
	if (!element) throw new Error('floating panel host was not mounted');
	return element;
}

function frame(): HTMLIFrameElement {
	const element = host().shadowRoot?.querySelector('iframe');
	if (!element) throw new Error('floating panel iframe was not mounted');
	return element;
}

function sendPanelMessage(data: unknown, source: MessageEventSource | null = frame().contentWindow, origin = 'chrome-extension://corebrain-test') {
	window.dispatchEvent(new MessageEvent('message', { data, source, origin }));
}

describe('toggleFloatingPanel', () => {
	afterEach(() => {
		if (document.getElementById(HOST_ID)) toggleFloatingPanel(EXTENSION_URL);
		document.body.innerHTML = '';
		vi.unstubAllGlobals();
	});

	it('mounts a single rounded, isolated panel with an extension popup iframe', () => {
		toggleFloatingPanel(EXTENSION_URL);

		const panel = host();
		const iframe = frame();
		expect(panel.shadowRoot).not.toBeNull();
		expect(panel.style.position).toBe('fixed');
		expect(panel.style.top).toBe('12px');
		expect(panel.style.right).toBe('12px');
		expect(panel.style.width).toBe('220px');
		expect(panel.style.borderRadius).toBe('22px');
		expect(panel.style.overflow).toBe('hidden');
		expect(iframe.src).toBe(EXTENSION_URL);
		expect(iframe.title).toBe('Corebrain');
		expect(iframe.referrerPolicy).toBe('strict-origin');
	});

	it('toggles closed and restores focus to the control that opened it', () => {
		const opener = document.createElement('button');
		document.body.appendChild(opener);
		opener.focus();

		toggleFloatingPanel(EXTENSION_URL);
		expect(host()).toBeTruthy();
		toggleFloatingPanel(EXTENSION_URL);

		expect(document.getElementById(HOST_ID)).toBeNull();
		expect(document.activeElement).toBe(opener);
	});

	it('keeps an existing panel open when called with ensureOpen', () => {
		toggleFloatingPanel(EXTENSION_URL);
		const initialHost = host();

		toggleFloatingPanel(EXTENSION_URL, true);

		expect(host()).toBe(initialHost);
		expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1);
	});

	it('closes on outside pointerdown and Escape and restores opener focus', () => {
		const opener = document.createElement('button');
		const outside = document.createElement('button');
		document.body.append(opener, outside);
		opener.focus();
		toggleFloatingPanel(EXTENSION_URL);

		outside.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
		expect(document.getElementById(HOST_ID)).toBeNull();
		expect(document.activeElement).toBe(opener);

		toggleFloatingPanel(EXTENSION_URL);
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(document.getElementById(HOST_ID)).toBeNull();
		expect(document.activeElement).toBe(opener);
	});

	it('accepts resize and close messages only from its own extension iframe', () => {
		toggleFloatingPanel(EXTENSION_URL);
		const iframe = frame();
		const initialHeight = host().style.height;

		sendPanelMessage({ type: 'corebrain-floating-size', height: 250 }, window);
		sendPanelMessage({ type: 'corebrain-floating-size', height: 250 }, iframe.contentWindow, 'chrome-extension://other-extension');
		expect(host().style.height).toBe(initialHeight);

		sendPanelMessage({ type: 'corebrain-floating-size', height: 250 });
		expect(host().style.height).toBe('250px');
		expect(iframe.style.height).toBe('250px');

		sendPanelMessage({ type: 'corebrain-floating-close' }, window);
		expect(document.getElementById(HOST_ID)).not.toBeNull();
		sendPanelMessage({ type: 'corebrain-floating-close' });
		expect(document.getElementById(HOST_ID)).toBeNull();
	});

	it('clamps reported height to 100px minimum and viewport height minus 24px maximum', () => {
		vi.stubGlobal('innerHeight', 400);
		toggleFloatingPanel(EXTENSION_URL);

		sendPanelMessage({ type: 'corebrain-floating-size', height: 30 });
		expect(host().style.height).toBe('100px');
		sendPanelMessage({ type: 'corebrain-floating-size', height: 900 });
		expect(host().style.height).toBe('376px');

		vi.stubGlobal('innerHeight', 200);
		window.dispatchEvent(new Event('resize'));
		expect(host().style.height).toBe('176px');
	});

	it('ignores non-finite or non-numeric resize requests', () => {
		toggleFloatingPanel(EXTENSION_URL);
		const before = host().style.height;
		sendPanelMessage({ type: 'corebrain-floating-size', height: '300' });
		sendPanelMessage({ type: 'corebrain-floating-size', height: Number.POSITIVE_INFINITY });
		expect(host().style.height).toBe(before);
	});
});
