import type { FilterValues, ListObj, PersonalInfo } from '../types';
import { LocalStorageKeys } from './constants';

type LocalStorageValueMap = {
	[LocalStorageKeys.PersonalInfo]: PersonalInfo;
	[LocalStorageKeys.PreferredStore]: string;
	[LocalStorageKeys.Lists]: ListObj[];
	[LocalStorageKeys.ListsVersion]: number;
	[LocalStorageKeys.AppVersion]: string;
	[LocalStorageKeys.CurrentFilters]: FilterValues;
	[LocalStorageKeys.Theme]: '' | 'dark' | 'light';
	[LocalStorageKeys.ViewedShares]: string[];
};

type LocalStorageKey = keyof LocalStorageValueMap;
type LocalStorageArrayKey = {
	[K in LocalStorageKey]: LocalStorageValueMap[K] extends readonly unknown[] ? K : never;
}[LocalStorageKey];

type LocalStorageArrayItem<K extends LocalStorageArrayKey> =
	LocalStorageValueMap[K] extends readonly (infer T)[] ? T : never;

export class LocalStorageManager {
	static getItem<K extends LocalStorageKey>(key: K): LocalStorageValueMap[K] | null {
		const item = localStorage.getItem(key);
		if (item) {
			try {
				return JSON.parse(item) as LocalStorageValueMap[K];
			} catch {
				return item as unknown as LocalStorageValueMap[K];
			}
		}
		return null;
	}

	static setItem<K extends LocalStorageKey>(key: K, value: LocalStorageValueMap[K]): void {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch (e) {
			console.error(`Error setting localStorage item for key "${key}":`, e);
		}
	}

	static appendToArrayItem<K extends LocalStorageArrayKey>(
		key: K,
		value: LocalStorageArrayItem<K>
	): void {
		const currentArray = (this.getItem(key) || []) as LocalStorageArrayItem<K>[];
		try {
			currentArray.push(value);
			this.setItem(key, currentArray as LocalStorageValueMap[K]);
		} catch (e) {
			console.error(`Error appending to localStorage array for key "${key}":`, e);
		}
	}

	static removeItem(key: LocalStorageKey): void {
		try {
			localStorage.removeItem(key);
		} catch (e) {
			console.error(`Error removing localStorage item for key "${key}":`, e);
		}
	}

	static clear(keys?: LocalStorageKey[]): void {
		try {
			if (keys) {
				keys.forEach((key) => localStorage.removeItem(key));
			} else {
				localStorage.clear();
			}
		} catch (e) {
			console.error('Error clearing localStorage:', e);
		}
	}
}
