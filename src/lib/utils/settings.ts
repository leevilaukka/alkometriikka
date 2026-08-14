const OPEN_SETTINGS_EVENT = 'alkometriikka:open-settings';

export function requestSettingsOpen(): void {
	window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

export function onSettingsOpenRequested(handler: () => void): () => void {
	window.addEventListener(OPEN_SETTINGS_EVENT, handler);
	return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handler);
}
