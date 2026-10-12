import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BridgeAuthenticationError } from './utils/x-bookmarks';

const testState = vi.hoisted(() => {
	const listeners: Array<(...args: any[]) => any> = [];
	const tabMutations: any[] = [];
	const writes: any[] = [];
	const storage = { x_bookmarks_last_id: 'old', x_bookmarks_pasta: 'Clippings' } as Record<string, any>;
	const browserMock: any = {
		runtime: {
			getURL: (path: string) => `chrome-extension://test/${path}`,
			sendMessage: vi.fn(async () => ({})),
			onMessage: { addListener: (listener: (...args: any[]) => any) => listeners.push(listener) },
			onConnect: { addListener: vi.fn() },
			onInstalled: { addListener: vi.fn() },
		},
		storage: {
			local: {
				get: vi.fn(async (keys?: string | string[]) => {
					if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, storage[key]]));
					if (typeof keys === 'string') return { [keys]: storage[keys] };
					return { ...storage };
				}),
				set: vi.fn(async (values: any) => { writes.push(values); Object.assign(storage, values); }),
			},
			sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) },
			onChanged: { addListener: vi.fn() },
		},
		tabs: {
			query: vi.fn(async () => []),
			create: vi.fn(async (options: any) => { tabMutations.push(['create', options]); return { id: 90 }; }),
			update: vi.fn(async (id: number, options: any) => { tabMutations.push(['update', id, options]); return { id }; }),
			remove: vi.fn(async (id: number) => { tabMutations.push(['remove', id]); }),
			get: vi.fn(async (id: number) => ({ id })),
			sendMessage: vi.fn(async () => ({})),
			onActivated: { addListener: vi.fn() },
			onUpdated: { addListener: vi.fn() },
			onRemoved: { addListener: vi.fn() },
		},
		action: { setPopup: vi.fn(async () => undefined), onClicked: { addListener: vi.fn() } },
		commands: { onCommand: { addListener: vi.fn() } },
		contextMenus: { removeAll: vi.fn(async () => undefined), create: vi.fn(async () => undefined), onClicked: { addListener: vi.fn() } },
		i18n: { getMessage: (key: string) => key },
	};
	return {
		listeners,
		tabMutations,
		writes,
		storage,
		browserMock,
		bridgeAvailable: vi.fn(async () => true),
		fetchBookmarks: vi.fn(async () => ({ novos: [], paginas: 0, alcancouFim: true })),
		sendBookmarks: vi.fn(async () => ({ criados: 0, pulados: 0, erros: 0 })),
		fallbackSave: vi.fn(async () => ({ salvos: 0, erros: 0 })),
	};
});

vi.mock('webextension-polyfill', () => ({ ...testState.browserMock, default: testState.browserMock }));
vi.mock('./utils/x-bookmarks', () => ({
	BridgeAuthenticationError: class extends Error {
		constructor(status: number) { super(`Corebrain bridge authentication failed (${status}). Check the pairing token.`); this.name = 'BridgeAuthenticationError'; }
	},
	estaLogadoNoX: vi.fn(async () => true),
	observarQueryId: vi.fn(),
	buscarBookmarks: (...args: any[]) => (testState.fetchBookmarks as any)(...args),
	salvarComoNotas: (...args: any[]) => (testState.fallbackSave as any)(...args),
	pluginDisponivel: (...args: any[]) => (testState.bridgeAvailable as any)(...args),
	enviarPelaPonte: (...args: any[]) => (testState.sendBookmarks as any)(...args),
	DEFAULT_X_BOOKMARK_FOLDER: 'Clippings',
	podeAvancarMarcador: (total: number, salvos: number, pulados: number, erros: number, fim: boolean) => fim && total > 0 && erros === 0 && salvos + pulados === total,
}));
vi.mock('./utils/instagram-saved', () => ({
	buscarSalvosInstagram: vi.fn(), enviarSalvosInstagram: vi.fn(), DEFAULT_INSTAGRAM_SAVED_FOLDER: 'Instagram',
}));
vi.mock('./utils/instagram-sync', () => ({
	createInstagramSyncController: vi.fn(() => ({ getStatus: vi.fn(), cancel: vi.fn(), start: vi.fn() })),
	INSTAGRAM_SYNC_STORAGE_KEY: 'instagram-status',
}));
vi.mock('./utils/instagram-sync-start', () => ({ startInstagramSyncPinned: vi.fn() }));
vi.mock('./utils/storage-utils', () => ({ incrementStat: vi.fn(), loadSettings: vi.fn(async () => ({ vaults: [] })) }));
vi.mock('./utils/panel-window', () => ({ createPanelWindowController: vi.fn(() => ({ open: vi.fn() })) }));
vi.mock('./utils/floating-launcher', () => ({ launchFloatingPanel: vi.fn(async () => undefined) }));
vi.mock('./utils/browser-detection', () => ({ detectBrowser: vi.fn(async () => 'firefox') }));
vi.mock('./utils/active-tab-manager', () => ({
	updateCurrentActiveTab: vi.fn(), isValidUrl: vi.fn(() => true), isBlankPage: vi.fn(() => false), isNormalPageUrl: vi.fn(() => false),
}));
vi.mock('./utils/debounce', () => ({ debounce: (fn: (...args: any[]) => any) => fn }));
vi.mock('./utils/debug', () => ({ debugLog: vi.fn() }));
vi.mock('./utils/webrequest-guard', () => ({ precisaFallbackWebRequest: vi.fn(() => false) }));

beforeAll(async () => {
	(globalThis as any).chrome = {
		runtime: { id: 'test-extension' },
		declarativeNetRequest: { updateSessionRules: vi.fn(async () => undefined) },
	};
	await import('./background');
});

beforeEach(() => {
	testState.tabMutations.splice(0);
	testState.writes.splice(0);
	testState.storage.x_bookmarks_last_id = 'old';
	testState.storage.x_bookmarks_pasta = 'Clippings';
	testState.bridgeAvailable.mockReset().mockResolvedValue(true);
	testState.fetchBookmarks.mockReset().mockResolvedValue({ novos: [], paginas: 0, alcancouFim: true });
	testState.sendBookmarks.mockReset().mockResolvedValue({ criados: 0, pulados: 0, erros: 0 });
	testState.fallbackSave.mockReset().mockResolvedValue({ salvos: 0, erros: 0 });
});

function xSyncListener() {
	// The background entry installs a generic fetchProxy listener and then the
	// actual message handler. Select the one that handles the sync action.
	return testState.listeners[testState.listeners.length - 1]!;
}

async function dispatchXSync() {
	let response: any;
	const keepChannelOpen = xSyncListener()({ action: 'x-bookmarks-sync-e-salvar' }, {}, (value: unknown) => { response = value; });
	await vi.waitFor(() => expect(response).toBeDefined());
	return { keepChannelOpen, response };
}

describe('background X bookmark sync message', () => {
	it('fails before requesting X and never opens or changes a browser tab without the bridge', async () => {
		testState.bridgeAvailable.mockResolvedValue(false);
		testState.fetchBookmarks.mockResolvedValue({ novos: [{ id: '2' } as any], paginas: 1, alcancouFim: true } as any);
		const { response } = await dispatchXSync();

		expect(response).toMatchObject({ success: false });
		expect(response.error).toMatch(/abra o obsidian/i);
		expect(response.error).toMatch(/ative o plugin corebrain/i);
		expect(response.error).toMatch(/pareamento/i);
		expect(testState.fetchBookmarks).not.toHaveBeenCalled();
		expect(testState.sendBookmarks).not.toHaveBeenCalled();
		expect(testState.fallbackSave).not.toHaveBeenCalled();
		expect(testState.tabMutations).toEqual([]);
		expect(testState.writes).toEqual([]);
	});

	it('uses bridge dedup counts and advances the cursor only after a complete successful write', async () => {
		testState.fetchBookmarks.mockResolvedValue({ novos: [{ id: 'newest' }, { id: 'old' }] as any, paginas: 2, alcancouFim: true });
		testState.sendBookmarks.mockResolvedValue({ criados: 1, pulados: 1, erros: 0 });
		const { response } = await dispatchXSync();

		expect(response).toMatchObject({ success: true, salvos: 1, pulados: 1, erros: 0, encontrados: 2 });
		expect(testState.sendBookmarks).toHaveBeenCalledOnce();
		expect(testState.fallbackSave).not.toHaveBeenCalled();
		expect(testState.storage.x_bookmarks_last_id).toBe('newest');
	});

	it('preserves the cursor when X pagination is incomplete', async () => {
		testState.fetchBookmarks.mockResolvedValue({ novos: [{ id: 'newest' }] as any, paginas: 50, alcancouFim: false });
		testState.sendBookmarks.mockResolvedValue({ criados: 1, pulados: 0, erros: 0 });
		const { response } = await dispatchXSync();

		expect(response).toMatchObject({ success: true, incompleto: true, salvos: 1 });
		expect(testState.storage.x_bookmarks_last_id).toBe('old');
	});

	it('preserves the cursor when the bridge reports item-level write errors', async () => {
		testState.fetchBookmarks.mockResolvedValue({ novos: [{ id: 'newest' }, { id: 'older' }] as any, paginas: 1, alcancouFim: true });
		testState.sendBookmarks.mockResolvedValue({ criados: 0, pulados: 1, erros: 1 });
		const { response } = await dispatchXSync();

		expect(response).toMatchObject({ success: true, salvos: 0, pulados: 1, erros: 1 });
		expect(testState.storage.x_bookmarks_last_id).toBe('old');
	});

	it('reports an actionable Portuguese error for a pairing-token rejection before contacting X', async () => {
		testState.bridgeAvailable.mockRejectedValue(new BridgeAuthenticationError(401));
		const { response } = await dispatchXSync();

		expect(response).toMatchObject({ success: false });
		expect(response.error).toMatch(/abra o obsidian/i);
		expect(response.error).toMatch(/ative o plugin corebrain/i);
		expect(response.error).toMatch(/pareamento/i);
		expect(testState.fetchBookmarks).not.toHaveBeenCalled();
	});

	it('rejects a concurrent sync before a second X request can start', async () => {
		const finishFetches: Array<(result: any) => void> = [];
		testState.fetchBookmarks.mockImplementation(() => new Promise((resolve) => { finishFetches.push(resolve); }) as any);
		let firstResponse: any;
		const listener = xSyncListener();
		listener({ action: 'x-bookmarks-sync-e-salvar' }, {}, (value: unknown) => { firstResponse = value; });
		await vi.waitFor(() => expect(testState.fetchBookmarks).toHaveBeenCalledOnce());

		let secondResponse: any;
		listener({ action: 'x-bookmarks-sync-e-salvar' }, {}, (value: unknown) => { secondResponse = value; });
		try {
			await vi.waitFor(() => expect(testState.fetchBookmarks.mock.calls.length === 1 || secondResponse !== undefined).toBe(true));
			expect(testState.fetchBookmarks).toHaveBeenCalledOnce();
			expect(secondResponse).toMatchObject({ success: false });
			expect(secondResponse.error).toMatch(/já está em andamento/i);
		} finally {
			for (const finish of finishFetches) finish({ novos: [], paginas: 0, alcancouFim: true });
		}
		await vi.waitFor(() => expect(firstResponse).toMatchObject({ success: true }));
	});

	it('does not advance the cursor or fall back to URI writes when the bridge rejects the batch', async () => {
		testState.fetchBookmarks.mockResolvedValue({ novos: [{ id: 'newest' }] as any, paginas: 1, alcancouFim: true });
		testState.sendBookmarks.mockRejectedValue(new Error('plugin respondeu 500'));
		const { response } = await dispatchXSync();

		expect(response).toEqual({ success: false, error: 'plugin respondeu 500' });
		expect(testState.storage.x_bookmarks_last_id).toBe('old');
		expect(testState.fallbackSave).not.toHaveBeenCalled();
		expect(testState.tabMutations).toEqual([]);
	});
});
