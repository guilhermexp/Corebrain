let active = false;
let targetOrigin: string | null = null;
let resizeObserver: ResizeObserver | null = null;
let lastHeight = 0;

function isFloatingLocation(): boolean {
	const params = new URLSearchParams(window.location.search);
	return params.get('surface') === 'floating' && params.get('context') === 'iframe';
}

function getWebOrigin(value: string): string | null {
	try {
		const url = new URL(value);
		if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin === 'null') return null;
		return url.origin;
	} catch {
		return null;
	}
}

function getParentOrigin(): string | null {
	const params = new URLSearchParams(window.location.search);
	const requestedOrigin = params.get('parentOrigin');
	const explicitOrigin = requestedOrigin ? getWebOrigin(requestedOrigin) : null;
	const referrerOrigin = document.referrer ? getWebOrigin(document.referrer) : null;
	if (explicitOrigin && referrerOrigin && explicitOrigin !== referrerOrigin) return null;
	return explicitOrigin || referrerOrigin;
}

function postToHost(message: { type: 'corebrain-floating-size'; height: number } | { type: 'corebrain-floating-close' }): void {
	if (!targetOrigin) return;
	window.parent.postMessage(message, targetOrigin);
}

function reportHeight(): void {
	if (!active || !targetOrigin || !document.body) return;
	const height = Math.max(
		100,
		Math.ceil(document.body.scrollHeight),
		Math.ceil(document.body.getBoundingClientRect().height)
	);
	if (height === lastHeight) return;
	lastHeight = height;
	postToHost({ type: 'corebrain-floating-size', height });
}

function closeButtonClick(): void {
	postToHost({ type: 'corebrain-floating-close' });
}

function onKeyDown(event: KeyboardEvent): void {
	if (event.key !== 'Escape' || !active) return;
	event.preventDefault();
	event.stopPropagation();
	closeButtonClick();
}

function cleanup(): void {
	resizeObserver?.disconnect();
	resizeObserver = null;
	document.removeEventListener('keydown', onKeyDown);
	document.getElementById('floating-panel-close')?.removeEventListener('click', closeButtonClick);
	window.removeEventListener('pagehide', cleanup);
	active = false;
}

/** Initializes the popup-as-iframe surface; regular browser popups are unchanged. */
export function initFloatingPanel(): boolean {
	if (!isFloatingLocation()) return false;
	if (active) return true;

	active = true;
	lastHeight = 0;
	targetOrigin = getParentOrigin();
	document.documentElement.classList.add('is-floating', 'is-embedded');

	const header = document.getElementById('popup-header');
	if (header && !document.getElementById('floating-panel-close')) {
		const closeButton = document.createElement('button');
		closeButton.id = 'floating-panel-close';
		closeButton.type = 'button';
		closeButton.className = 'compact-icon-button floating-panel-close';
		closeButton.setAttribute('aria-label', 'Fechar painel');
		closeButton.title = 'Fechar painel';
		closeButton.textContent = '×';
		closeButton.addEventListener('click', closeButtonClick);
		header.appendChild(closeButton);
	}

	document.addEventListener('keydown', onKeyDown);
	window.addEventListener('pagehide', cleanup, { once: true });
	if (typeof ResizeObserver !== 'undefined') {
		resizeObserver = new ResizeObserver(reportHeight);
		resizeObserver.observe(document.body);
	}
	reportHeight();
	return true;
}

/** Returns true when the active floating host owns closing this surface. */
export function closeFloatingPanel(): boolean {
	if (!isFloatingLocation()) return false;
	postToHost({ type: 'corebrain-floating-close' });
	return true;
}
