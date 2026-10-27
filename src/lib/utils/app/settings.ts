const OPEN_SETTINGS_EVENT = 'alkometriikka:open-settings';

export function requestSettingsOpen(): void {
	window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

/** Opens the settings dialog on the tab with this id */
export function requestSettingsTab(tab: string): void {
	window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { tab } }));
}

export function onSettingsOpenRequested(handler: (tab?: string) => void): () => void {
	const listener = (event: Event) => {
		const tab = (event as CustomEvent<{ tab?: unknown } | null>).detail?.tab;
		handler(typeof tab === 'string' ? tab : undefined);
	};
	window.addEventListener(OPEN_SETTINGS_EVENT, listener);
	return () => window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
}
