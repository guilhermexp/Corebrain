import { describe, expect, it, vi } from 'vitest';
import { createPanelWindowController } from './panel-window';

function makeDeps() {
	const windows = {
		create: vi.fn(async (_options: unknown) => ({ id: 41 })),
		get: vi.fn(async (_id: number, _options?: unknown) => ({
			id: 41,
			type: 'popup',
			tabs: [{ id: 81, url: 'chrome-extension://test-id/popup.html?surface=window&sourceTabId=17' }],
		})),
		getAll: vi.fn(async (_options: unknown) => [] as Array<{ id?: number; type?: string; tabs?: Array<{ id?: number; url?: string }> }>),
		update: vi.fn(async (_id: number, _options: unknown) => ({ id: 41 })),
	};
	const tabs = {
		update: vi.fn(async (_id: number, _options: unknown) => ({ id: 81 })),
	};
	return {
		windows,
		tabs,
		getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
	};
}

describe('panel window controller', () => {
	it('opens a compact extension-owned popup window linked to the source tab', async () => {
		const deps = makeDeps();
		const panel = createPanelWindowController(deps);

		await panel.open(17);

		expect(deps.getURL).toHaveBeenCalledWith('popup.html');
		expect(deps.windows.create).toHaveBeenCalledWith({
			url: 'chrome-extension://test-id/popup.html?surface=window&sourceTabId=17',
			type: 'popup',
			width: 260,
			height: 420,
			focused: true,
		});
		expect(deps.windows.get).not.toHaveBeenCalled();
	});

	it('reuses and focuses its live window, updating the source tab context', async () => {
		const deps = makeDeps();
		const panel = createPanelWindowController(deps);
		await panel.open(17);

		await panel.open(23);

		expect(deps.windows.create).toHaveBeenCalledTimes(1);
		expect(deps.windows.get).toHaveBeenCalledWith(41, { populate: true });
		expect(deps.tabs.update).toHaveBeenCalledWith(81, {
			url: 'chrome-extension://test-id/popup.html?surface=window&sourceTabId=23',
			active: true,
		});
		expect(deps.windows.update).toHaveBeenCalledWith(41, { focused: true });
	});

	it('creates a new window if the previously tracked window has been closed', async () => {
		const deps = makeDeps();
		const panel = createPanelWindowController(deps);
		await panel.open(17);
		deps.windows.get.mockRejectedValueOnce(new Error('No window with id'));

		await panel.open(23);

		expect(deps.windows.create).toHaveBeenCalledTimes(2);
		expect(deps.windows.create).toHaveBeenLastCalledWith(expect.objectContaining({
			url: 'chrome-extension://test-id/popup.html?surface=window&sourceTabId=23',
		}));
	});

	it('recovers the owned window after a background-worker restart instead of duplicating it', async () => {
		const deps = makeDeps();
		deps.windows.getAll.mockResolvedValueOnce([{
			id: 52,
			type: 'popup',
			tabs: [{
				id: 91,
				url: 'chrome-extension://test-id/popup.html?surface=window&sourceTabId=17',
			}],
		}]);

		await createPanelWindowController(deps).open(23);

		expect(deps.windows.create).not.toHaveBeenCalled();
		expect(deps.tabs.update).toHaveBeenCalledWith(91, {
			url: 'chrome-extension://test-id/popup.html?surface=window&sourceTabId=23',
			active: true,
		});
		expect(deps.windows.update).toHaveBeenCalledWith(52, { focused: true });
	});

	it('omits the source query when opened without an originating tab', async () => {
		const deps = makeDeps();
		await createPanelWindowController(deps).open();

		expect(deps.windows.create).toHaveBeenCalledWith(expect.objectContaining({
			url: 'chrome-extension://test-id/popup.html?surface=window',
		}));
	});

	it('does not hijack a tracked window that the user navigated away from', async () => {
		const deps = makeDeps();
		const panel = createPanelWindowController(deps);
		await panel.open(17);
		deps.windows.get.mockResolvedValueOnce({
			id: 41,
			type: 'popup',
			tabs: [{ id: 81, url: 'https://example.com/' }],
		});

		await panel.open(23);

		expect(deps.windows.create).toHaveBeenCalledTimes(2);
		expect(deps.tabs.update).not.toHaveBeenCalled();
		expect(deps.windows.update).not.toHaveBeenCalled();
	});

	it('does not hijack a normal window containing a Corebrain-looking page', async () => {
		const deps = makeDeps();
		deps.windows.getAll.mockResolvedValueOnce([{
			id: 52,
			type: 'normal',
			tabs: [
				{ id: 80, url: 'https://example.com/' },
				{ id: 91, url: 'chrome-extension://test-id/popup.html?surface=window' },
			],
		}]);

		await createPanelWindowController(deps).open(23);

		expect(deps.windows.create).toHaveBeenCalledTimes(1);
		expect(deps.tabs.update).not.toHaveBeenCalled();
	});

	it('updates the matching panel tab rather than the first tab in its popup window', async () => {
		const deps = makeDeps();
		deps.windows.getAll.mockResolvedValueOnce([{
			id: 52,
			type: 'popup',
			tabs: [
				{ id: 80, url: 'https://example.com/' },
				{ id: 91, url: 'chrome-extension://test-id/popup.html?surface=window' },
			],
		}]);

		await createPanelWindowController(deps).open(23);

		expect(deps.windows.create).not.toHaveBeenCalled();
		expect(deps.tabs.update).toHaveBeenCalledWith(91, {
			url: 'chrome-extension://test-id/popup.html?surface=window&sourceTabId=23',
			active: true,
		});
	});
});
