// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const state = vi.hoisted(() => ({
  token: 'fixture-token', response: { ok: true, caminho: 'Clippings/Test.md', duplicata: false } as unknown,
  status: 200, offline: false, protocol: 2, behavior: 'create', requests: [] as Array<{ url: string; body?: string }>,
  stat: vi.fn(async () => undefined), close: vi.fn(), uri: vi.fn(), delayAck: false,
  releaseAck: undefined as undefined | (() => void),
}));
vi.mock('../utils/browser-polyfill', () => ({ default: {
  runtime: { id: 'fixture', connect: vi.fn(), getURL: (p: string) => p,
    sendMessage: vi.fn(async (message: { action: string }) => {
      if (message.action === 'getActiveTab') return { tabId: 1 };
      if (message.action === 'getTabInfo') return { success: true, tab: { id: 1, url: 'https://example.test/article' } };
      return {};
    }), onMessage: { addListener: vi.fn() } },
  storage: { local: { get: vi.fn(async () => ({ corebrain_bridge_port: 27125, corebrain_bridge_token: state.token })), onChanged: { addListener: vi.fn() } } },
} }));
vi.mock('../utils/storage-utils', () => ({
  incrementStat: state.stat, addHistoryEntry: vi.fn(), getClipHistory: vi.fn(),
  getLocalStorage: vi.fn(async () => null), setLocalStorage: vi.fn(async () => undefined),
  loadSettings: vi.fn(async () => ({ vaults: [], openBehavior: 'popup', saveBehavior: 'addToObsidian' })),
  generalSettings: { propertyTypes: [], interpreterEnabled: false, models: [] },
}));
vi.mock('../managers/template-manager', () => ({ loadTemplates: vi.fn(async () => [{
  id: 'test', name: 'Test', get behavior() { return state.behavior; }, noteNameFormat: 'Test',
  path: 'Clippings', noteContentFormat: 'initial content', properties: [], triggers: [],
}]), createDefaultTemplate: vi.fn() }));
vi.mock('../utils/content-extractor', () => ({ extractPageContent: vi.fn(async () => ({
  title: 'Fixture', content: 'fixture', extractedContent: {}, highlights: [],
})), initializePageContent: vi.fn(async () => ({ currentVariables: {} })) }));
vi.mock('../utils/template-compiler', () => ({ compileTemplate: vi.fn(async (_id: number, text: string) => text) }));
vi.mock('../utils/triggers', () => ({ initializeTriggers: vi.fn(), findMatchingTemplate: vi.fn(async () => null) }));
vi.mock('../utils/browser-detection', () => ({ addBrowserClassToHtml: vi.fn(), detectBrowser: vi.fn(async () => 'chrome') }));
vi.mock('../utils/i18n', () => ({ translatePage: vi.fn(), setupLanguageAndDirection: vi.fn(), getMessage: (s: string) => s }));
vi.mock('../icons/icons', () => ({ initializeIcons: vi.fn(), getPropertyTypeIcon: vi.fn() }));
vi.mock('../managers/inspect-variables', () => ({ showVariables: vi.fn(), initializeVariablesPanel: vi.fn(), updateVariablesPanel: vi.fn() }));
vi.mock('../utils/interpreter', () => ({ initializeInterpreter: vi.fn(), handleInterpreterUI: vi.fn(), collectPromptVariables: vi.fn(() => []) }));
vi.mock('../utils/floating-panel-client', () => ({ initFloatingPanel: vi.fn(), closeFloatingPanel: () => false }));
vi.mock('../utils/x-sync-ui', () => ({ initXSync: vi.fn() }));
vi.mock('../utils/instagram-sync-ui', () => ({ initInstagramSync: vi.fn() }));
vi.mock('../utils/obsidian-note-creator', () => ({ generateFrontmatter: vi.fn(async () => '---\n---\n'), saveToObsidian: state.uri }));

beforeAll(async () => {
  document.documentElement.innerHTML = readFileSync(resolve('src/popup.html'), 'utf8')
    .replace(/^<!DOCTYPE html>/i, '').replace(/<html[^>]*>|<\/html>/gi, '');
  vi.stubGlobal('crypto', webcrypto);
  vi.spyOn(window, 'close').mockImplementation(state.close);
  // Popup registers its DOMContentLoaded listener at module initialization.
  await import('./popup');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await vi.waitFor(() => expect((document.getElementById('clip-btn') as HTMLButtonElement).disabled).toBe(false));
});
beforeEach(() => {
  state.response = { ok: true, caminho: 'Clippings/Test.md', duplicata: false };
  state.status = 200; state.offline = false; state.protocol = 2; state.token = 'fixture-token'; state.behavior = 'create';
  state.requests = []; state.stat.mockClear(); state.close.mockClear(); state.uri.mockClear();
  state.delayAck = false; state.releaseAck = undefined;
  const error = document.querySelector('.error-message') as HTMLElement;
  error.textContent = ''; error.style.display = 'none';
  const input = document.getElementById('note-content-field') as HTMLTextAreaElement;
  input.value = 'preserved user content';
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input); state.requests.push({ url, body: typeof init?.body === 'string' ? init.body : undefined });
    if (state.offline) throw new TypeError('network unavailable');
    if (url.includes('/prova?')) {
      const nonce = new URL(url).searchParams.get('nonce');
      const prova = createHmac('sha256', state.token).update(`corebrain-ponte-prova:v1:${nonce}`).digest('hex');
      return { ok: true, status: 200, json: async () => ({ plugin: 'clippings-gallery', protocol: state.protocol, prova }) };
    }
    if (url.includes('/tem?')) return { ok: true, status: 200, json: async () => ({ existe: false, caminho: null }) };
    if (state.delayAck) await new Promise<void>(resolve => { state.releaseAck = resolve; });
    return { ok: state.status === 200, status: state.status, json: async () => state.response };
  }));
});

describe('page capture button and bridge acknowledgement', () => {
  it('keeps capture available and content intact when the bridge is absent', async () => {
    state.offline = true;
    (document.getElementById('clip-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector('.error-message')?.textContent).toBeTruthy());
    expect((document.getElementById('note-content-field') as HTMLTextAreaElement).value).toBe('preserved user content');
    expect((document.getElementById('clip-btn') as HTMLButtonElement).disabled).toBe(false);
    expect(document.getElementById('clip-btn')?.classList.contains('clipping')).toBe(false);
    expect(state.stat).not.toHaveBeenCalled(); expect(state.close).not.toHaveBeenCalled();
  });
  it('rejects an invalid acknowledgement without claiming the page was saved', async () => {
    state.response = { ok: true, caminho: '', duplicata: false };
    (document.getElementById('clip-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector('.error-message')?.textContent).toBeTruthy());
    expect(state.stat).not.toHaveBeenCalled(); expect(state.close).not.toHaveBeenCalled();
    expect((document.getElementById('note-content-field') as HTMLTextAreaElement).value).toBe('preserved user content');
    expect((document.getElementById('clip-btn') as HTMLButtonElement).disabled).toBe(false);
  });
  it.each([
    ['missing token', () => { state.token = ''; }],
    ['old protocol', () => { state.protocol = 1; }],
    ['HTTP 401', () => { state.status = 401; }],
    ['HTTP 413', () => { state.status = 413; }],
  ])('keeps the capture recoverable for %s', async (_label, setup) => {
    setup();
    (document.getElementById('clip-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector('.error-message')?.textContent).toBeTruthy());
    expect((document.getElementById('note-content-field') as HTMLTextAreaElement).value).toBe('preserved user content');
    expect((document.getElementById('clip-btn') as HTMLButtonElement).disabled).toBe(false);
    expect(document.getElementById('clip-btn')?.classList.contains('clipping')).toBe(false);
    expect(state.stat).not.toHaveBeenCalled(); expect(state.close).not.toHaveBeenCalled();
    expect(state.uri).not.toHaveBeenCalled();
  });
  it.each(['append-daily', 'prepend-daily'])('saves a normal clip with an inherited %s template', async (behavior) => {
    state.behavior = behavior;
    state.delayAck = true;
    (document.getElementById('clip-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(state.releaseAck).toBeTypeOf('function'));
    const clip = state.requests.find(request => request.url.endsWith('/clip'));
    expect(JSON.parse(clip?.body ?? '{}').conteudo).toContain('preserved user content');
    expect(state.stat).not.toHaveBeenCalled(); expect(state.close).not.toHaveBeenCalled();
    state.releaseAck?.();
    await vi.waitFor(() => expect(state.stat).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(state.close).toHaveBeenCalledOnce(), { timeout: 1500 });
    expect(state.uri).not.toHaveBeenCalled();
  });
  it('times out a stalled clip, keeps the text and allows a successful retry', async () => {
    const originalSetTimeout = window.setTimeout.bind(window);
    // Vitest sees the Node timer overload, while jsdom returns a browser timer ID.
    const timer = vi.spyOn(window, 'setTimeout').mockImplementation((handler, delay, ...args) =>
      originalSetTimeout(handler, delay === 20_000 ? 150 : delay, ...args) as unknown as NodeJS.Timeout);
    try {
      state.delayAck = true;
      (document.getElementById('clip-btn') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(state.releaseAck).toBeTypeOf('function'));
      await vi.waitFor(() => expect(document.querySelector('.error-message')?.textContent).toBeTruthy());
      expect((document.getElementById('note-content-field') as HTMLTextAreaElement).value).toBe('preserved user content');
      expect(document.getElementById('clip-btn')?.classList.contains('clipping')).toBe(false);
      expect(state.stat).not.toHaveBeenCalled(); expect(state.close).not.toHaveBeenCalled();
      state.releaseAck?.();
      state.delayAck = false;
      (document.getElementById('clip-btn') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(state.stat).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(state.close).toHaveBeenCalledOnce(), { timeout: 1500 });
      expect(state.uri).not.toHaveBeenCalled();
    } finally { timer.mockRestore(); }
  });
  it('waits for a valid acknowledgement before recording success and closing', async () => {
    state.delayAck = true;
    (document.getElementById('clip-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(state.releaseAck).toBeTypeOf('function'));
    expect(state.stat).not.toHaveBeenCalled(); expect(state.close).not.toHaveBeenCalled();
    const clip = state.requests.find(request => request.url.endsWith('/clip'));
    expect(JSON.parse(clip?.body ?? '{}').conteudo).toContain('preserved user content');
    state.releaseAck?.();
    await vi.waitFor(() => expect(state.stat).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(state.close).toHaveBeenCalledOnce(), { timeout: 1500 });
    expect(state.uri).not.toHaveBeenCalled();
  });
});
