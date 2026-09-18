import { describe, test, expect, beforeEach, vi } from 'vitest';
import browser from './browser-polyfill';
import {
  DEFAULT_BRIDGE_PORT,
  BRIDGE_PORT_KEY,
  BRIDGE_TOKEN_KEY,
  getBridgeSettings,
  saveBridgeSettings,
  testBridgeConnection,
} from './bridge-settings';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Corebrain bridge settings', () => {
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
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ protocol: 1, plugin: 'clippings-gallery' }) });
    vi.stubGlobal('fetch', fetcher);

    await expect(testBridgeConnection()).resolves.toEqual({ ok: true, protocol: 1 });
    const sentHeaders = fetcher.mock.calls[0][1].headers as Headers;
    expect(sentHeaders.get('Authorization')).toBe('Bearer secret-token');
    expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:27126/ping');
    expect(fetcher.mock.calls[0][0]).not.toContain('secret-token');
  });

  test('connection check reports authentication errors without hiding them', async () => {
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({
      [BRIDGE_PORT_KEY]: 27125,
      [BRIDGE_TOKEN_KEY]: 'wrong',
    } as any);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    await expect(testBridgeConnection()).resolves.toEqual({ ok: false, error: 'authentication' });
  });

  test('connection check rejects an incompatible bridge protocol or plugin', async () => {
    vi.spyOn(browser.storage.local, 'get').mockResolvedValue({
      [BRIDGE_PORT_KEY]: 27125,
      [BRIDGE_TOKEN_KEY]: 'token',
    } as any);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ protocol: 2, plugin: 'other' }),
    }));
    await expect(testBridgeConnection()).resolves.toEqual({ ok: false, error: 'protocol' });
  });
});
