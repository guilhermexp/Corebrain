import browser from './browser-polyfill';

export const DEFAULT_BRIDGE_PORT = 27125;
export const BRIDGE_PORT_KEY = 'corebrain_bridge_port';
export const BRIDGE_TOKEN_KEY = 'corebrain_bridge_token';

export interface BridgeSettings {
	port: number;
	token: string;
}

export type BridgeConnectionResult =
	| { ok: true; protocol: number }
	| { ok: false; error: 'missing-token' | 'authentication' | 'unavailable' | 'protocol' };

function normalizePort(value: unknown): number {
	const port = typeof value === 'number' ? value : Number(value);
	return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_BRIDGE_PORT;
}

export async function getBridgeSettings(): Promise<BridgeSettings> {
	const stored = await browser.storage.local.get([BRIDGE_PORT_KEY, BRIDGE_TOKEN_KEY]) as Record<string, unknown>;
	return {
		port: normalizePort(stored[BRIDGE_PORT_KEY]),
		token: typeof stored[BRIDGE_TOKEN_KEY] === 'string' ? stored[BRIDGE_TOKEN_KEY].trim() : '',
	};
}

export async function saveBridgeSettings(changes: Partial<BridgeSettings>): Promise<BridgeSettings> {
	const current = await getBridgeSettings();
	const next: BridgeSettings = {
		port: normalizePort(changes.port ?? current.port),
		token: typeof changes.token === 'string' ? changes.token.trim() : current.token,
	};
	await browser.storage.local.set({
		[BRIDGE_PORT_KEY]: next.port,
		[BRIDGE_TOKEN_KEY]: next.token,
	});
	return next;
}

export function bridgeUrl(path: string, port = DEFAULT_BRIDGE_PORT): string {
	const cleanPath = path.startsWith('/') ? path : `/${path}`;
	return `http://127.0.0.1:${normalizePort(port)}${cleanPath}`;
}

/**
 * Shared authenticated fetch for the loopback bridge. The token is deliberately
 * only put in a request header; URL strings may be copied into browser history
 * and logs by tooling outside this extension.
 */
export async function fetchBridge(path: string, init: RequestInit = {}): Promise<Response> {
	const settings = await getBridgeSettings();
	const headers = new Headers(init.headers || {});
	if (settings.token) headers.set('Authorization', `Bearer ${settings.token}`);
	return fetch(bridgeUrl(path, settings.port), { ...init, headers });
}

export function isCompatibleBridge(body: unknown): boolean {
	if (!body || typeof body !== 'object') return false;
	const value = body as { protocol?: unknown; plugin?: unknown };
	return value.protocol === 1 && value.plugin === 'clippings-gallery';
}

export async function testBridgeConnection(): Promise<BridgeConnectionResult> {
	const settings = await getBridgeSettings();
	if (!settings.token) return { ok: false, error: 'missing-token' };
	try {
		const response = await fetchBridge('/ping');
		if (response.status === 401 || response.status === 403) return { ok: false, error: 'authentication' };
		if (!response.ok) return { ok: false, error: 'unavailable' };
		const body = await response.json().catch(() => null) as { protocol?: unknown; plugin?: unknown } | null;
		return isCompatibleBridge(body)
			? { ok: true, protocol: 1 }
			: { ok: false, error: 'protocol' };
	} catch {
		return { ok: false, error: 'unavailable' };
	}
}

/** Wire the small pairing form in the extension options page. */
export async function initializeBridgeSettings(): Promise<void> {
	const portInput = document.getElementById('corebrain-bridge-port') as HTMLInputElement | null;
	const tokenInput = document.getElementById('corebrain-bridge-token') as HTMLInputElement | null;
	const testButton = document.getElementById('corebrain-bridge-test') as HTMLButtonElement | null;
	const status = document.getElementById('corebrain-bridge-status');
	if (!portInput || !tokenInput || !testButton) return;

	const current = await getBridgeSettings();
	portInput.value = String(current.port);
	tokenInput.value = current.token;
	tokenInput.type = 'password';
	tokenInput.autocomplete = 'off';

	const saveInputs = async (): Promise<void> => {
		const saved = await saveBridgeSettings({ port: Number(portInput.value), token: tokenInput.value });
		portInput.value = String(saved.port);
		tokenInput.value = saved.token;
	};
	portInput.addEventListener('change', () => { void saveInputs(); });
	tokenInput.addEventListener('change', () => { void saveInputs(); });

	testButton.addEventListener('click', async () => {
		testButton.disabled = true;
		if (status) status.textContent = 'Testing connection…';
		try {
			await saveInputs();
			const result = await testBridgeConnection();
			if (!status) return;
			status.textContent = result.ok
				? `Connected (protocol ${result.protocol}).`
				: result.error === 'authentication'
					? 'Authentication failed. Copy the token from Corebrain settings.'
					: result.error === 'missing-token'
						? 'Enter the pairing token first.'
						: result.error === 'protocol'
							? 'Connected, but the bridge protocol is unsupported.'
							: 'Corebrain is unavailable on this port.';
		} finally {
			testButton.disabled = false;
		}
	});
}
