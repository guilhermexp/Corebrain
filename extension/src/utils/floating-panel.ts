export const FLOATING_PANEL_ID = 'corebrain-floating-panel';

const PANEL_MIN_HEIGHT = 100;
const VIEWPORT_GUTTER = 24;
const PANEL_WIDTH = 220;
const PANEL_RADIUS = 22;
const PANEL_STATE_KEY = '__corebrainFloatingPanelState__';

interface FloatingPanelState {
	close: () => void;
}

interface FloatingPanelWindow extends Window {
	[PANEL_STATE_KEY]?: FloatingPanelState;
}

function extensionOrigin(extensionUrl: string): string {
	const parsed = new URL(extensionUrl);
	if (!parsed.protocol || !parsed.host) {
		throw new TypeError('The floating panel requires a valid extension URL.');
	}
	// URL.origin serializes extension schemes as "null" in some engines, while
	// message events serialize them as chrome-extension://<id> / moz-extension://<id>.
	return parsed.origin === 'null' ? `${parsed.protocol}//${parsed.host}` : parsed.origin;
}

/** Toggle an isolated, rounded popup surface on the current page. */
export function toggleFloatingPanel(extensionUrl: string, ensureOpen = false): void {
	const win = window as FloatingPanelWindow;
	const previousState = win[PANEL_STATE_KEY];
	const existing = document.getElementById(FLOATING_PANEL_ID);

	if (existing) {
		if (existing.getAttribute('data-corebrain-floating-panel') !== 'true') return;
		if (ensureOpen) return;
		if (previousState) previousState.close();
		else existing.remove();
		return;
	}

	// Clean up listeners left by a panel node removed by the page itself.
	previousState?.close();

	const origin = extensionOrigin(extensionUrl);
	const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	const host = document.createElement('div');
	host.id = FLOATING_PANEL_ID;
	host.setAttribute('data-corebrain-floating-panel', 'true');
	host.setAttribute('aria-label', 'Corebrain');
	for (const [property, value] of Object.entries({
		all: 'initial',
		position: 'fixed',
		top: '12px',
		right: '12px',
		width: `${PANEL_WIDTH}px`,
		maxWidth: `calc(100vw - ${VIEWPORT_GUTTER}px)`,
		height: `${PANEL_MIN_HEIGHT}px`,
		maxHeight: `calc(100vh - ${VIEWPORT_GUTTER}px)`,
		zIndex: '2147483647',
		display: 'block',
		margin: '0',
		padding: '0',
		border: '0',
		boxSizing: 'border-box',
		borderRadius: `${PANEL_RADIUS}px`,
		overflow: 'hidden',
		background: '#191919',
		boxShadow: '0 12px 38px rgba(0, 0, 0, 0.38)',
		contain: 'layout style paint',
		transform: 'none',
		isolation: 'isolate',
	})) {
		host.style.setProperty(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value, 'important');
	}

	const shadow = host.attachShadow({ mode: 'open' });
	const style = document.createElement('style');
	style.textContent = `
		:host {
			display: block;
		width: ${PANEL_WIDTH}px;
		max-width: calc(100vw - ${VIEWPORT_GUTTER}px);
			height: ${PANEL_MIN_HEIGHT}px;
			max-height: calc(100vh - ${VIEWPORT_GUTTER}px);
			border-radius: ${PANEL_RADIUS}px;
			overflow: hidden;
			background: #191919;
			box-shadow: 0 12px 38px rgba(0, 0, 0, 0.38);
			color-scheme: dark;
		}
		iframe {
			display: block;
			width: 100%;
			height: 100%;
			min-height: ${PANEL_MIN_HEIGHT}px;
			margin: 0;
			padding: 0;
			border: 0;
			background: transparent;
		}
	`;
	const iframe = document.createElement('iframe');
	iframe.src = extensionUrl;
	iframe.title = 'Corebrain';
	iframe.allow = 'clipboard-write; web-share';
	iframe.referrerPolicy = 'strict-origin';
	shadow.append(style, iframe);

	let desiredHeight = PANEL_MIN_HEIGHT;
	let closed = false;
	const maximumHeight = () => Math.max(PANEL_MIN_HEIGHT, window.innerHeight - VIEWPORT_GUTTER);
	const applyHeight = () => {
		const height = Math.min(Math.max(PANEL_MIN_HEIGHT, desiredHeight), maximumHeight());
		host.style.setProperty('height', `${height}px`, 'important');
		iframe.style.height = `${height}px`;
	};
	const restoreOpenerFocus = () => {
		if (!opener?.isConnected) return;
		try {
			opener.focus({ preventScroll: true });
		} catch {
			opener.focus();
		}
	};
	const onPointerDown = (event: PointerEvent) => {
		const path = event.composedPath();
		if (path.includes(host) || host.contains(event.target as Node)) return;
		close();
	};
	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') close();
	};
	const onResize = () => applyHeight();
	const onMessage = (event: MessageEvent) => {
		if (event.source !== iframe.contentWindow || event.origin !== origin) return;
		if (!event.data || typeof event.data !== 'object') return;

		if (event.data.type === 'corebrain-floating-size') {
			const { height } = event.data as { height?: unknown };
			if (typeof height !== 'number' || !Number.isFinite(height)) return;
			desiredHeight = Math.round(height);
			applyHeight();
		} else if (event.data.type === 'corebrain-floating-close') {
			close();
		}
	};
	const state: FloatingPanelState = {
		close: () => {
			if (closed) return;
			closed = true;
			document.removeEventListener('pointerdown', onPointerDown, true);
			document.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('resize', onResize);
			window.removeEventListener('message', onMessage);
			host.remove();
			if (win[PANEL_STATE_KEY] === state) delete win[PANEL_STATE_KEY];
			restoreOpenerFocus();
		},
	};
	const close = () => state.close();

	document.addEventListener('pointerdown', onPointerDown, true);
	document.addEventListener('keydown', onKeyDown, true);
	window.addEventListener('resize', onResize);
	window.addEventListener('message', onMessage);
	win[PANEL_STATE_KEY] = state;
	document.documentElement.appendChild(host);
	applyHeight();
}
