import { lists, personalInfo, punchRecipes, watchlist } from '$lib/global.svelte';
import { sanitizePunch } from '../catalog/punch';
import { LocalStorageKeys } from '../constants/app';
import {
	exportableKeys,
	LocalStorageManager,
	persistentExportKeys,
	type LocalStorageKey
} from './storage';

function download(data: unknown) {
	const blob = new Blob([JSON.stringify(data, null, 2)], {
		type: 'application/json'
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `alkometriikka-tiedot-${new Date().toISOString().slice(0, 10)}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/** Exports the picked keys (everything exportable by default), under their storage key names */
export function handleExport(dataToExport: LocalStorageKey[] = exportableKeys) {
	const keys = [...new Set([...dataToExport, ...persistentExportKeys])];
	const data: Record<string, unknown> = {};
	for (const key of keys) {
		data[key] = LocalStorageManager.getItem(key);
	}
	data.exported_at = new Date().toISOString();
	data.exported_keys = keys;
	download(data);
}

/** Adds what is not here yet, matched by id, so importing never drops or doubles anything */
function mergeById<T extends { id?: unknown }>(current: T[], incoming: unknown, parse = (item: T): T | null => item) {
	if (!Array.isArray(incoming)) return current;
	const known = new Set(current.map((item) => String(item.id)));
	const added: T[] = [];
	for (const raw of incoming as T[]) {
		const item = raw && typeof raw === 'object' ? parse(raw) : null;
		if (item && !known.has(String(item.id))) {
			known.add(String(item.id));
			added.push(item);
		}
	}
	return [...current, ...added];
}

function importData(data: Record<string, any>) {
	if (!data || typeof data !== 'object') throw new Error('Not an export file');
	// Files from before the key picker name their fields differently and hold everything
	const legacy = !Array.isArray(data.exported_keys);
	const wanted = (key: LocalStorageKey) => legacy || data.exported_keys.includes(key);
	const get = (key: LocalStorageKey, legacyName: string) => (legacy ? data[legacyName] : data[key]);

	const info = get(LocalStorageKeys.PersonalInfo, 'personalInfo');
	if (wanted(LocalStorageKeys.PersonalInfo) && info && typeof info === 'object') {
		LocalStorageManager.setItem(LocalStorageKeys.PersonalInfo, { ...personalInfo, ...info });
	}
	if (wanted(LocalStorageKeys.Lists)) {
		LocalStorageManager.setItem(
			LocalStorageKeys.Lists,
			mergeById(lists, get(LocalStorageKeys.Lists, 'lists'))
		);
	}
	if (wanted(LocalStorageKeys.Watchlist)) {
		// Products already watched here keep what was seen of them here
		LocalStorageManager.setItem(
			LocalStorageKeys.Watchlist,
			mergeById(watchlist, data[LocalStorageKeys.Watchlist] ?? data.watchlist)
		);
	}
	if (wanted(LocalStorageKeys.PunchRecipes)) {
		LocalStorageManager.setItem(
			LocalStorageKeys.PunchRecipes,
			mergeById(
				punchRecipes,
				data[LocalStorageKeys.PunchRecipes] ?? data.punchRecipes,
				(item) => {
					const recipe = sanitizePunch(item);
					return recipe && typeof item.id === 'string'
						? { ...recipe, id: item.id, savedAt: String(item.savedAt ?? '') }
						: null;
				}
			)
		);
	}
	const store = get(LocalStorageKeys.PreferredStore, 'preferredStoreId');
	if (wanted(LocalStorageKeys.PreferredStore) && typeof store === 'string') {
		LocalStorageManager.setItem(LocalStorageKeys.PreferredStore, store);
	}
	if (!legacy) {
		// Nothing reads these yet; they are kept so a future migration can tell what wrote the data
		for (const key of persistentExportKeys) {
			if (wanted(key) && data[key] != null) LocalStorageManager.setItem(key, data[key]);
		}
		if (wanted(LocalStorageKeys.CurrentFilters) && data[LocalStorageKeys.CurrentFilters]) {
			LocalStorageManager.setItem(LocalStorageKeys.CurrentFilters, data[LocalStorageKeys.CurrentFilters]);
		}
		if (wanted(LocalStorageKeys.Theme) && ['dark', 'light'].includes(data[LocalStorageKeys.Theme])) {
			LocalStorageManager.setItem(LocalStorageKeys.Theme, data[LocalStorageKeys.Theme]);
		}
	}
}

export function handleImport() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';
	input.onchange = async (event) => {
		const file = (event?.target as HTMLInputElement)?.files?.[0];
		if (file) {
			try {
				importData(JSON.parse(await file.text()));
			} catch (error) {
				console.error('Import failed:', error);
				alert('Tietojen tuonti epäonnistui: tiedosto ei ole kelvollinen.');
				return;
			}
			window.location.reload();
		}
	};
	input.click();
}

export function handleClearAll() {
	if (
		confirm('Haluatko varmasti tyhjentää kaikki tallennetut tiedot? Tätä toimintoa ei voi perua.')
	) {
		LocalStorageManager.clear();
		window.location.reload();
	}
}
