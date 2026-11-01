// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';
import { initCompactPopup } from './compact-popup';
import { initInstagramSync } from './instagram-sync-ui';
import type { InstagramSyncStatus } from './instagram-sync';

const initial: InstagramSyncStatus = {
  running: false, phase: 'idle', found: 0, processed: 0, total: 0, pages: 0,
  created: 0, skipped: 0, errors: 0, completeScan: false,
  cancelRequested: false, warnings: [], updatedAt: 0,
};
let broadcast: (message: unknown) => unknown;
const element = (id: string) => document.getElementById(id)!;
const visible = () => !element('instagram-sync-status').classList.contains('is-hidden');
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const publish = (patch: Partial<InstagramSyncStatus>) => broadcast({
  action: 'instagram-saved-progress', status: { ...initial, updatedAt: Date.now(), ...patch },
});

async function openPopup(status = initial): Promise<void> {
  vi.spyOn(browser.runtime, 'sendMessage').mockImplementation(async (message: unknown) => {
    if (message && typeof message === 'object' && 'action' in message && message.action === 'instagram-saved-sync') {
      return { success: true, accepted: true, status: { ...initial, running: true, phase: 'checking-bridge', updatedAt: Date.now() } };
    }
    return status;
  });
  initCompactPopup();
  initInstagramSync();
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  document.body.innerHTML = `<a id="instagram-sync" href="#">Sincronizar Instagram</a>
    <div id="instagram-sync-status" class="is-hidden">
      <details class="sync-details"><summary id="instagram-sync-summary">Instagram</summary>
      <span id="instagram-sync-texto"></span></details>
      <a id="instagram-sync-cancelar" class="is-hidden">Cancelar</a>
      <div id="instagram-sync-progresso"></div>
    </div>`;
  vi.spyOn(browser.runtime.onMessage, 'addListener').mockImplementation(listener => {
    broadcast = listener as typeof broadcast;
  });
});
afterEach(() => {
  window.dispatchEvent(new Event('unload'));
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('Instagram sync feedback lifecycle', () => {
  it('restores the initial state eight seconds after a local start failure without status', async () => {
    await openPopup();
    vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce({ success: false, error: 'Falha local' });
    element('instagram-sync').click();
    await flush();
    expect(element('instagram-sync-texto').textContent).toContain('Falha local');
    await vi.advanceTimersByTimeAsync(7_999);
    expect(visible()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(visible()).toBe(false);
    expect(element('instagram-sync').getAttribute('aria-disabled')).toBe('false');
  });

  it('does not let a local error timer hide a new active import', async () => {
    await openPopup();
    vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce({ success: false, error: 'Falha local' });
    element('instagram-sync').click();
    await flush();
    await vi.advanceTimersByTimeAsync(4_000);
    element('instagram-sync').click();
    await flush();
    publish({ running: true, phase: 'fetching', found: 12, pages: 1 });
    await vi.advanceTimersByTimeAsync(4_001);
    expect(visible()).toBe(true);
    expect(element('instagram-sync').getAttribute('aria-disabled')).toBe('true');
    expect(element('instagram-sync-summary').textContent).toContain('12');
  });
  it('keeps an active import visible after cancellation fails', async () => {
    await openPopup();
    publish({ running: true, phase: 'fetching', found: 12, pages: 1 });
    vi.mocked(browser.runtime.sendMessage).mockResolvedValueOnce({ ok: false, error: 'Cancelamento falhou' });
    element('instagram-sync-cancelar').click();
    await flush();
    await vi.advanceTimersByTimeAsync(8_001);
    expect(visible()).toBe(true);
    expect(element('instagram-sync').getAttribute('aria-disabled')).toBe('true');
    expect(element('instagram-sync-texto').textContent).toContain('Cancelamento falhou');
  });


  it('shows actual discovery and write counts without opening details', async () => {
    await openPopup();
    publish({ running: true, phase: 'fetching', found: 42, pages: 2 });
    await flush();
    expect(element('instagram-sync-summary').textContent).toContain('42');
    publish({ running: true, phase: 'saving', found: 100, total: 100, processed: 30, created: 25, skipped: 4, errors: 1 });
    await flush();
    const summary = element('instagram-sync-summary').textContent;
    expect(summary).toContain('30 de 100');
    expect(summary).toContain('25 criados');
    expect(summary).toContain('4 já existiam');
    expect(summary).toContain('1 erro');
    expect(element('instagram-sync-progresso').style.width).toBe('30%');
  });

  it('shows the result briefly and restores the initial controls after completion', async () => {
    await openPopup();
    publish({ phase: 'complete', found: 5, total: 5, processed: 5, created: 5, completeScan: true });
    await flush();
    expect(visible()).toBe(true);
    expect(element('instagram-sync-summary').textContent).toContain('5 criados');
    await vi.advanceTimersByTimeAsync(4_001);
    expect(visible()).toBe(false);
    expect(element('instagram-sync').getAttribute('aria-disabled')).toBe('false');
    expect(element('instagram-sync-cancelar').classList.contains('is-hidden')).toBe(true);
    expect(element('instagram-sync-progresso').style.width).toBe('0%');
    expect(element('instagram-sync-texto').textContent).toBe('');
  });

  it('does not redisplay an expired completed run when the popup reopens', async () => {
    await openPopup({ ...initial, phase: 'complete', found: 5, created: 5, updatedAt: 90_000 });
    expect(visible()).toBe(false);
    expect(element('instagram-sync-progresso').classList.contains('indeterminado')).toBe(false);
  });

  it('keeps a new active run visible when an older result timer expires', async () => {
    await openPopup();
    publish({ phase: 'complete', found: 5, created: 5 });
    await vi.advanceTimersByTimeAsync(2_000);
    element('instagram-sync').click();
    await flush();
    publish({ running: true, phase: 'fetching', found: 12, pages: 1 });
    await vi.advanceTimersByTimeAsync(12_000);
    expect(visible()).toBe(true);
    expect(element('instagram-sync').getAttribute('aria-disabled')).toBe('true');
    expect(element('instagram-sync-summary').textContent).toContain('12');
  });

  it('shows partial errors long enough to read before restoring the initial state', async () => {
    await openPopup();
    publish({ phase: 'partial', found: 5, created: 3, skipped: 1, errors: 1, error: 'Falha ao gravar uma nota.' });
    await vi.advanceTimersByTimeAsync(4_001);
    expect(visible()).toBe(true);
    expect(element('instagram-sync-texto').textContent).toContain('Falha ao gravar uma nota.');
    await vi.advanceTimersByTimeAsync(4_000);
    expect(visible()).toBe(false);
    expect(element('instagram-sync').getAttribute('aria-disabled')).toBe('false');
  });
});
