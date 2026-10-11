/** Small extension-owned surface used when an in-page panel cannot be injected. */
export const PANEL_WINDOW_WIDTH = 260;
export const PANEL_WINDOW_HEIGHT = 420;

interface PanelWindowTab {
	id?: number;
	url?: string;
}

interface PanelWindowInfo {
	id?: number;
	type?: string;
	tabs?: PanelWindowTab[];
}

export interface PanelWindowDependencies {
	windows: {
		create(options: {
			url: string;
			type: 'popup';
			width: number;
			height: number;
			focused: true;
		}): Promise<PanelWindowInfo>;
		get(windowId: number, options: { populate: true }): Promise<PanelWindowInfo>;
		getAll(options: { populate: true }): Promise<PanelWindowInfo[]>;
		update(windowId: number, options: { focused: true }): Promise<unknown>;
	};
	tabs: {
		update(tabId: number, options: { url: string; active: true }): Promise<unknown>;
	};
	getURL(path: string): string;
}

function panelUrl(getURL: (path: string) => string, sourceTabId?: number): string {
	const url = new URL(getURL('popup.html'));
	url.searchParams.set('surface', 'window');
	if (typeof sourceTabId === 'number' && Number.isFinite(sourceTabId)) {
		url.searchParams.set('sourceTabId', String(sourceTabId));
	}
	return url.toString();
}

function matchingPanelTab(window: PanelWindowInfo, getURL: (path: string) => string): PanelWindowTab | undefined {
	if (window.type !== 'popup') return undefined;
	const expected = new URL(getURL('popup.html'));
	return window.tabs?.find((tab) => {
		if (typeof tab.url !== 'string') return false;
		try {
			const candidate = new URL(tab.url);
			return candidate.protocol === expected.protocol
				&& candidate.host === expected.host
				&& candidate.pathname === expected.pathname
				&& candidate.searchParams.get('surface') === 'window';
		} catch {
			return false;
		}
	});
}

/**
 * Opens the compact popup UI in a dedicated extension window. Unlike the
 * toolbar-action popup, this surface can be opened from restricted pages too.
 * A single live window is reused and pointed at the latest source tab.
 */
export function createPanelWindowController(deps: PanelWindowDependencies) {
	let windowId: number | undefined;
	let queued: Promise<void> = Promise.resolve();

	async function openWindow(sourceTabId?: number): Promise<void> {
		const url = panelUrl(deps.getURL, sourceTabId);
		let existing: PanelWindowInfo | undefined;

		if (windowId !== undefined) {
			try {
				const candidate = await deps.windows.get(windowId, { populate: true });
				if (matchingPanelTab(candidate, deps.getURL)) existing = candidate;
				else windowId = undefined;
			} catch {
				// The user may have closed the panel window since the previous launch.
				windowId = undefined;
			}
		}

		// MV3 workers are routinely suspended. Recover the owned window by its
		// extension URL instead of opening duplicates after each worker restart.
		if (!existing) {
			try {
				existing = (await deps.windows.getAll({ populate: true }))
					.find((candidate) => matchingPanelTab(candidate, deps.getURL));
			} catch {
				// If enumeration is unavailable, try opening a fresh extension window.
			}
		}

		if (existing) {
			const existingTabId = matchingPanelTab(existing, deps.getURL)?.id;
			if (existing.id === undefined || existingTabId === undefined) {
				throw new Error('The existing Corebrain panel window has no addressable tab.');
			}
			await deps.tabs.update(existingTabId, { url, active: true });
			await deps.windows.update(existing.id, { focused: true });
			windowId = existing.id;
			return;
		}

		const created = await deps.windows.create({
			url,
			type: 'popup',
			width: PANEL_WINDOW_WIDTH,
			height: PANEL_WINDOW_HEIGHT,
			focused: true,
		});
		windowId = typeof created.id === 'number' ? created.id : undefined;
	}

	return {
		open(sourceTabId?: number): Promise<void> {
			// Serialize launches so two rapid toolbar clicks cannot create duplicate
			// windows while the first windows.create() call is still pending.
			const result = queued.then(() => openWindow(sourceTabId));
			queued = result.catch(() => undefined);
			return result;
		},
	};
}
