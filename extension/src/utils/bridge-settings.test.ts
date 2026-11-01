import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createHmac, webcrypto } from 'node:crypto';
import browser from './browser-polyfill';
import {
  DEFAULT_BRIDGE_PORT,
  BRIDGE_PORT_KEY,
  BRIDGE_TOKEN_KEY,
  getBridgeSettings,
  saveBridgeSettings,
  fetchBridge,
  testBridgeConnection,
} from './bridge-settings';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function proofResponse(url: string, token: string) {
  const nonce = new URL(url).searchParams.get('nonce');
  const prova = createHmac('sha256', token).update(`corebrain-ponte-prova:v1:${nonce}`).digest('hex');
  return { ok: true, status: 200, json: async () => ({ plugin: 'clippings-gallery', protocol: 2, prova }) };
}

describe('Corebrain bridge settings', () => {
  test('missing pairing token never sends the clip to an unverified bridge', async () => {
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({});
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchBridge('/clip', { method: 'POST', body: 'private clip' })).rejects.toMatchObject({ name: 'BridgeMissingTokenError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test('impostor never receives authorization or clip body', async () => {
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({ [BRIDGE_TOKEN_KEY]: 'secret' });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ plugin: 'clippings-gallery', protocol: 2, prova: 'wrong' }) };
    }));
    await expect(fetchBridge('/clip', { method: 'POST', body: 'private clip' })).rejects.toMatchObject({ name: 'BridgeUnverifiedError' });
    expect(requests).toHaveLength(1);
    expect(new Headers(requests[0].init?.headers).has('Authorization')).toBe(false);
    expect(requests[0].init?.body).toBeUndefined();
  });

  test('old plugin without proof route reports protocol incompatibility', async () => {
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({ [BRIDGE_TOKEN_KEY]: 'secret' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
    await expect(testBridgeConnection()).resolves.toEqual({ ok: false, error: 'protocol' });
  });

  test('legitimate bridge accepts the fixed HMAC proof before sending the clip', async () => {
    const token = 'a'.repeat(64);
    const nonce = '0'.repeat(64);
    const proof = createHmac('sha256', token).update('corebrain-ponte-prova:v1:' + nonce).digest('hex');
    expect(proof).toBe('03c81216624caf8d2e3fdd924ff36fd3d1e98046aabd10d3c2ecf99d765a284e');
    vi.stubGlobal('crypto', { subtle: webcrypto.subtle, getRandomValues: (bytes: Uint8Array) => bytes.fill(0) });
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({ [BRIDGE_TOKEN_KEY]: token });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      return url.includes('/prova?')
        ? { ok: true, status: 200, json: async () => ({ plugin: 'clippings-gallery', protocol: 2, prova: proof }) }
        : { ok: true, status: 200 };
    }));
    await fetchBridge('/clip', { method: 'POST', body: 'private clip' });
    expect(requests[0].url).toBe(`http://127.0.0.1:27125/prova?nonce=${nonce}`);
    expect(new Headers(requests[0].init?.headers).has('Authorization')).toBe(false);
    expect(requests[1].init?.body).toBe('private clip');
    expect(new Headers(requests[1].init?.headers).get('Authorization')).toBe(`Bearer ${token}`);
  });

  test('uses the fresh-install loopback defaults and local storage keys', async () => {
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({} as any);
    const settings = await getBridgeSettings();
    expect(settings).toEqual({ port: DEFAULT_BRIDGE_PORT, token: '' });

    const set = vi.spyOn(browser.storage.local, 'set').mockResolvedValue(undefined);
    await saveBridgeSettings({ port: 27126, token: 'secret' });
    expect(set).toHaveBeenCalledWith({
      [BRIDGE_PORT_KEY]: 27126,
      [BRIDGE_TOKEN_KEY]: 'secret',
    });
  });

  test('normalizes invalid ports without changing the token', async () => {
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({
      [BRIDGE_PORT_KEY]: 'not-a-port',
      [BRIDGE_TOKEN_KEY]: ' token ',
    } as any);
    await expect(getBridgeSettings()).resolves.toEqual({ port: DEFAULT_BRIDGE_PORT, token: 'token' });
  });

  test('connection check sends the token as Authorization, never in the URL', async () => {
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({
      [BRIDGE_PORT_KEY]: 27126,
      [BRIDGE_TOKEN_KEY]: 'secret-token',
    } as any);
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => url.includes('/prova?')
      ? proofResponse(url, 'secret-token')
      : { ok: true, status: 200, json: async () => ({ protocol: 2, plugin: 'clippings-gallery' }) });
    vi.stubGlobal('fetch', fetcher);

    await expect(testBridgeConnection()).resolves.toEqual({ ok: true, protocol: 2 });
    const sentHeaders = fetcher.mock.calls[1][1]?.headers as Headers;
    expect(sentHeaders.get('Authorization')).toBe('Bearer secret-token');
    expect(fetcher.mock.calls[1][0]).toBe('http://127.0.0.1:27126/ping');
    expect(fetcher.mock.calls[1][0]).not.toContain('secret-token');
  });

  test('connection check reports authentication errors without hiding them', async () => {
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({
      [BRIDGE_PORT_KEY]: 27125,
      [BRIDGE_TOKEN_KEY]: 'wrong',
    } as any);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/prova?')
      ? proofResponse(url, 'wrong')
      : { ok: false, status: 401 }));
    await expect(testBridgeConnection()).resolves.toEqual({ ok: false, error: 'authentication' });
  });

  test('connection check rejects an incompatible bridge protocol or plugin', async () => {
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({
      [BRIDGE_PORT_KEY]: 27125,
      [BRIDGE_TOKEN_KEY]: 'token',
    } as any);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ protocol: 1, plugin: 'clippings-gallery' }),
    }));
    await expect(testBridgeConnection()).resolves.toEqual({ ok: false, error: 'protocol' });
  });
});
