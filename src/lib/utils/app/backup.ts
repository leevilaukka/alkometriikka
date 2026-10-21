import { lists, personalInfo, preferredStoreId, watchlist } from '$lib/global.svelte';
import { get } from 'svelte/store';
import { LocalStorageKeys } from '../constants/app';
import { LocalStorageManager } from './storage';

export function handleExport() {
	const data = {
		personalInfo: personalInfo,
		preferredStoreId: get(preferredStoreId),
		lists: lists,
		watchlist: watchlist
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
			if (typeof data.preferredStoreId === 'string') {
				LocalStorageManager.setItem(LocalStorageKeys.PreferredStore, data.preferredStoreId);
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
