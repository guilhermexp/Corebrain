// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initFloatingPanel } from './floating-panel-client';

class TestResizeObserver {
	static instances: TestResizeObserver[] = [];
	callback: ResizeObserverCallback;
	disconnected = false;
	observed: Element[] = [];

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		TestResizeObserver.instances.push(this);
	}

	observe = (target: Element) => { this.observed.push(target); };
	unobserve = () => undefined;
	disconnect = () => { this.disconnected = true; };
}

function setSurface(search: string, referrer = 'https://example.com/') {
	history.replaceState(null, '', `/popup.html${search}`);
	Object.defineProperty(document, 'referrer', { configurable: true, value: referrer });
}

describe('floating popup client', () => {
	let postMessage: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		TestResizeObserver.instances = [];
		vi.stubGlobal('ResizeObserver', TestResizeObserver);
		document.documentElement.className = '';
		document.body.innerHTML = '<header id="popup-header"><button id="capture-controls-toggle">More</button></header><main>Content</main>';
		setSurface('?surface=floating&context=iframe');
		postMessage = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
	});

	afterEach(() => {
		window.dispatchEvent(new Event('pagehide'));
		postMessage.mockRestore();
		vi.unstubAllGlobals();
	});

	it('activates only on the floating iframe surface and adds an accessible close control', () => {
		setSurface('?surface=floating');
		expect(initFloatingPanel()).toBe(false);
		expect(document.documentElement.classList.contains('is-floating')).toBe(false);

		setSurface('?surface=floating&context=iframe');
		expect(initFloatingPanel()).toBe(true);
		expect(document.documentElement.classList.contains('is-floating')).toBe(true);
		expect(document.documentElement.classList.contains('is-embedded')).toBe(true);
		expect(document.getElementById('floating-panel-close')?.getAttribute('aria-label')).toBe('Fechar painel');
	});

	it('posts measured content height to the exact embedding extension origin', () => {
		Object.defineProperty(document.body, 'scrollHeight', { configurable: true, value: 187 });
		Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 187 });
		initFloatingPanel();
		expect(TestResizeObserver.instances[0].observed).toContain(document.body);
		expect(postMessage).toHaveBeenCalledWith(
			{ type: 'corebrain-floating-size', height: 187 },
			'https://example.com'
		);
	});

	it('grows and shrinks from body content without the iframe viewport becoming a height floor', () => {
		let bodyHeight = 350;
		Object.defineProperty(document.body, 'scrollHeight', { configurable: true, get: () => bodyHeight });
		Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 650 });
		initFloatingPanel();
		const observer = TestResizeObserver.instances[0];
		bodyHeight = 650;
		observer.callback([], observer as unknown as ResizeObserver);
		bodyHeight = 350;
		observer.callback([], observer as unknown as ResizeObserver);
		expect(postMessage.mock.calls.map(([message]: [{ type: string; height?: number }]) => (message as { height: number }).height)).toEqual([350, 650, 350]);
	});

	it('uses a validated explicit HTTP(S) parent origin and rejects a referrer mismatch', () => {
		setSurface('?surface=floating&context=iframe&parentOrigin=https%3A%2F%2Fexample.com', '');
		initFloatingPanel();
		expect(postMessage).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'corebrain-floating-size' }),
			'https://example.com'
		);

		window.dispatchEvent(new Event('pagehide'));
		postMessage.mockClear();
		setSurface('?surface=floating&context=iframe&parentOrigin=https%3A%2F%2Fexample.com', 'https://other.example/');
		initFloatingPanel();
		expect(postMessage).not.toHaveBeenCalled();
	});

	it('routes Escape and its close button through a targeted close message', () => {
		initFloatingPanel();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		document.getElementById('floating-panel-close')!.click();
		expect(postMessage).toHaveBeenNthCalledWith(2, { type: 'corebrain-floating-close' }, 'https://example.com');
		expect(postMessage).toHaveBeenNthCalledWith(3, { type: 'corebrain-floating-close' }, 'https://example.com');
	});

	it('does not send messages with wildcard or invalid referrer origins and disconnects on pagehide', () => {
		setSurface('?surface=floating&context=iframe', '');
		initFloatingPanel();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(postMessage).not.toHaveBeenCalled();

		window.dispatchEvent(new Event('pagehide'));
		expect(TestResizeObserver.instances.every(observer => observer.disconnected)).toBe(true);
	});
});
