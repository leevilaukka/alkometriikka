import { lists, personalInfo, preferredStoreId } from '$lib/global.svelte';
import { get } from 'svelte/store';
import { LocalStorageKeys } from '../constants/app';
import { LocalStorageManager } from './storage';
import { locale, m } from '$lib/i18n';

export function handleExport() {
	const data = {
		personalInfo: personalInfo,
		preferredStoreId: get(preferredStoreId),
		lists: lists
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
			if (typeof data.preferredStoreId === 'string') {
				LocalStorageManager.setItem(LocalStorageKeys.PreferredStore, data.preferredStoreId);
			}
			window.location.reload();
		}
	};
	input.click();
}

export function handleClearAll() {
	if (confirm(m.settings_clear_confirm())) {
		LocalStorageManager.clear();
		// The language is a display setting, not saved data, so it survives the clear
		try {
			if (locale !== 'fi') localStorage.setItem(LocalStorageKeys.Locale, locale);
		} catch {
			// Storage blocked: nothing was cleared either
		}
		window.location.reload();
	}
}
