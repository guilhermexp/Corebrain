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
	| { ok: false; error: 'missing-token' | 'authentication' | 'unavailable' | 'protocol' | 'unverified' };

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

export class BridgeUnverifiedError extends Error {
	constructor() {
		super('Corebrain bridge identity could not be verified.');
		this.name = 'BridgeUnverifiedError';
	}
}

export class BridgeMissingTokenError extends BridgeUnverifiedError {
	constructor() {
		super();
		this.message = 'Enter the Corebrain pairing token first.';
		this.name = 'BridgeMissingTokenError';
	}
}

export class BridgeProtocolError extends Error {
	constructor() {
		super('Update both the Corebrain plugin and extension.');
		this.name = 'BridgeProtocolError';
	}
}

async function verifyBridge(settings: BridgeSettings, signal?: AbortSignal | null): Promise<void> {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const nonce = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
	const response = await fetch(bridgeUrl(`/prova?nonce=${nonce}`, settings.port), { signal });
	if (response.status === 404 || response.status === 401) throw new BridgeProtocolError();
	if (!response.ok) throw new BridgeUnverifiedError();
	const body: unknown = await response.json().catch(() => null);
	if (!body || typeof body !== 'object') throw new BridgeUnverifiedError();
	const proof = body as { plugin?: unknown; protocol?: unknown; prova?: unknown };
	if (proof.protocol !== 2) throw new BridgeProtocolError();
	if (proof.plugin !== 'clippings-gallery' || typeof proof.prova !== 'string') throw new BridgeUnverifiedError();
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', encoder.encode(settings.token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`corebrain-ponte-prova:v1:${nonce}`));
	const expected = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
	if (proof.prova !== expected) throw new BridgeUnverifiedError();
}

/**
 * Shared authenticated fetch for the loopback bridge. The token is deliberately
 * only put in a request header; URL strings may be copied into browser history
 * and logs by tooling outside this extension.
 */
export async function fetchBridge(path: string, init: RequestInit = {}): Promise<Response> {
	const settings = await getBridgeSettings();
	const headers = new Headers(init.headers || {});
	if (!settings.token) throw new BridgeMissingTokenError();
	await verifyBridge(settings, init.signal);
	headers.set('Authorization', `Bearer ${settings.token}`);
	return fetch(bridgeUrl(path, settings.port), { ...init, headers });
}

export function isCompatibleBridge(body: unknown): boolean {
	if (!body || typeof body !== 'object') return false;
	const value = body as { protocol?: unknown; plugin?: unknown };
	return value.protocol === 2 && value.plugin === 'clippings-gallery';
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
			? { ok: true, protocol: 2 }
			: { ok: false, error: 'protocol' };
	} catch (error) {
		if (error instanceof BridgeUnverifiedError) return { ok: false, error: 'unverified' };
		if (error instanceof BridgeProtocolError) return { ok: false, error: 'protocol' };
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
							? 'Unsupported bridge protocol. Update both the Corebrain plugin and extension.'
							: result.error === 'unverified'
								? 'Could not verify the Corebrain bridge. Check the pairing token and plugin.'
								: 'Corebrain is unavailable on this port.';
		} finally {
			testButton.disabled = false;
		}
	});
}
