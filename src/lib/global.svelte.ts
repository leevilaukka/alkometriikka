import { writable } from 'svelte/store';
import { LocalStorageKeys } from './utils/constants';
import { LocalStorageManager } from './utils/storage';

export let personalInfo = $state(
	LocalStorageManager.getItem(LocalStorageKeys.PersonalInfo) || { gender: null, weight: null }
);
export let lists = $state(LocalStorageManager.getItem(LocalStorageKeys.Lists) || []);
export let customTemplates = $state(
	LocalStorageManager.getItem(LocalStorageKeys.CustomTemplates) || []
);

export let searchQuery = writable(new URLSearchParams(location.search).get('q') || '');

export let theme = writable(LocalStorageManager.getItem(LocalStorageKeys.Theme) ?? '');
export let preferredStoreId = writable(
	LocalStorageManager.getItem(LocalStorageKeys.PreferredStore) ?? ''
);

export let isMobile = writable(window.matchMedia('(width < 48rem)').matches);
export let isLaptop = writable(window.matchMedia('(width < 1280px)').matches);

export let isSafari = writable(/^((?!chrome|android).)*safari/i.test(navigator.userAgent));
export let isFirefox = writable(navigator.userAgent.toLowerCase().indexOf('firefox') > -1);
export let isChrome = writable(navigator.userAgent.toLowerCase().indexOf('chrome') > -1);
