import {
	browsePrefs,
	lists,
	onlyPreferredStore,
	personalInfo,
	preferredStoreId,
	punchRecipes,
	watchlist
} from '$lib/global.svelte';
import { sanitizeBrowsePrefs } from '../user/browsePrefs';
import { sanitizePunch } from '../catalog/punch';
import { get } from 'svelte/store';
import { LocalStorageKeys } from '../constants/app';
import { LocalStorageManager } from './storage';

export function handleExport() {
	const data = {
		personalInfo: personalInfo,
		preferredStoreId: get(preferredStoreId),
		onlyPreferredStore: get(onlyPreferredStore),
		browsePrefs: browsePrefs,
		lists: lists,
		watchlist: watchlist,
		punchRecipes: punchRecipes
	};
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

export function handleImport() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';
	input.onchange = async (event) => {
		const file = (event?.target as HTMLInputElement)?.files?.[0];
		if (file) {
			const text = await file.text();
			const data = JSON.parse(text);
			const currentPersonalInfo = { ...personalInfo };
			const currentLists = [...lists];
			LocalStorageManager.setItem(LocalStorageKeys.PersonalInfo, {
				...currentPersonalInfo,
				...data.personalInfo
			});
			LocalStorageManager.setItem(LocalStorageKeys.Lists, [...currentLists, ...data.lists]);
			if (Array.isArray(data.watchlist)) {
				// Products already watched here keep what was seen of them here
				const watched = new Set(watchlist.map((item) => item.id));
				LocalStorageManager.setItem(LocalStorageKeys.Watchlist, [
					...watchlist,
					...data.watchlist.filter((item: { id?: unknown }) => !watched.has(String(item?.id)))
				]);
			}
			if (Array.isArray(data.punchRecipes)) {
				const saved = new Set(punchRecipes.map((recipe) => recipe.id));
				LocalStorageManager.setItem(LocalStorageKeys.PunchRecipes, [
					...punchRecipes,
					...data.punchRecipes.flatMap((item: { id?: unknown; savedAt?: unknown }) => {
						const recipe = sanitizePunch(item);
						return recipe && typeof item.id === 'string' && !saved.has(item.id)
							? [{ ...recipe, id: item.id, savedAt: String(item.savedAt ?? '') }]
							: [];
					})
				]);
			}
			if (typeof data.preferredStoreId === 'string') {
				LocalStorageManager.setItem(LocalStorageKeys.PreferredStore, data.preferredStoreId);
			}
			if (typeof data.onlyPreferredStore === 'boolean') {
				LocalStorageManager.setItem(LocalStorageKeys.OnlyPreferredStore, data.onlyPreferredStore);
			}
			if (data.browsePrefs) {
				LocalStorageManager.setItem(
					LocalStorageKeys.BrowsePreferences,
					sanitizeBrowsePrefs(data.browsePrefs)
				);
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
