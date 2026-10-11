/**
 * Resolve the Instagram page that initiated a sync before starting any
 * asynchronous bridge work. Otherwise an active-tab lookup performed after
 * the bridge check can silently target a different page after focus changes.
 */
export function isSafeInstagramSourceTabId(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export async function startInstagramSyncPinned<T>(
	requestedSourceTabId: unknown,
	senderTabId: unknown,
	getActiveTabId: () => Promise<unknown>,
	start: (sourceTabId: number) => Promise<T>,
): Promise<T> {
	let sourceTabId: unknown;
	if (isSafeInstagramSourceTabId(requestedSourceTabId)) {
		sourceTabId = requestedSourceTabId;
	} else if (isSafeInstagramSourceTabId(senderTabId)) {
		sourceTabId = senderTabId;
	} else {
		sourceTabId = await getActiveTabId();
	}

	if (!isSafeInstagramSourceTabId(sourceTabId)) {
		throw new Error('Não foi possível identificar uma aba de origem para o Instagram. Abra seus salvos antes de sincronizar.');
	}
	return start(sourceTabId);
}
