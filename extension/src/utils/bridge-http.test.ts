import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, test, vi } from 'vitest';
import browser from './browser-polyfill';
import { fetchBridge } from './bridge-settings';

test('sends a clip over loopback only after a real HTTP challenge succeeds', async () => {
	const token = 'test-pairing-token';
	const requests: Array<{ path: string; authorization?: string; body: string }> = [];
	const server = createServer(async (req, res) => {
		let body = '';
		for await (const chunk of req) body += String(chunk);
		const url = new URL(req.url ?? '/', 'http://127.0.0.1');
		requests.push({ path: url.pathname, authorization: req.headers.authorization, body });
		res.setHeader('Content-Type', 'application/json');
		if (url.pathname === '/prova') {
			const nonce = url.searchParams.get('nonce');
			const prova = createHmac('sha256', token).update(`corebrain-ponte-prova:v1:${nonce}`).digest('hex');
			res.end(JSON.stringify({ plugin: 'clippings-gallery', protocol: 2, prova }));
		} else {
			res.end(JSON.stringify({ ok: true }));
		}
	});
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Loopback server did not bind');
	vi.spyOn(browser.storage.local, 'get').mockResolvedValue({ corebrain_bridge_port: address.port, corebrain_bridge_token: token });
	try {
		const response = await fetchBridge('/clip', { method: 'POST', body: 'clipping content' });
		expect(await response.json()).toEqual({ ok: true });
		expect(requests).toEqual([
			{ path: '/prova', authorization: undefined, body: '' },
			{ path: '/clip', authorization: `Bearer ${token}`, body: 'clipping content' },
		]);
	} finally {
		server.close();
		vi.restoreAllMocks();
	}
});
