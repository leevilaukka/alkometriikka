import type { Snippet } from 'svelte';
import type { WatchedProduct } from './types';
import { writable } from 'svelte/store';
import { LocalStorageKeys } from './utils/constants/app';
import { LocalStorageManager } from './utils/app/storage';
import { readSearchParams } from './utils/app/compressedParams';
import { emptyPunch, sanitizePunch, type SavedPunch } from './utils/catalog/punch';
import { sanitizeHeaderSlots, type NavHref } from './utils/app/nav';

export let personalInfo = $state(
	LocalStorageManager.getItem(LocalStorageKeys.PersonalInfo) || { gender: null, weight: null }
);
export let lists = $state(LocalStorageManager.getItem(LocalStorageKeys.Lists) || []);
export let compareProductIds = $state<string[]>(
	LocalStorageManager.getItem(LocalStorageKeys.CompareProducts) || []
);
/** Products the user follows for price and stock changes, see `src/lib/utils/user/watchlist.ts`. */
export let watchlist = $state<WatchedProduct[]>(
	LocalStorageManager.getItem(LocalStorageKeys.Watchlist) || []
);
/** The recipe open in the punch calculator, kept between visits */
export let punchDraft = $state(
	sanitizePunch(LocalStorageManager.getItem(LocalStorageKeys.PunchDraft)) ?? emptyPunch()
);
/** Punch recipes the user saved by name */
export let punchRecipes = $state<SavedPunch[]>(
	(LocalStorageManager.getItem(LocalStorageKeys.PunchRecipes) || []).flatMap((saved) => {
		const recipe = sanitizePunch(saved);
		return recipe && typeof saved.id === 'string'
			? [{ ...recipe, id: saved.id, savedAt: String(saved.savedAt ?? '') }]
			: [];
	})
);
/** The comparison table emphasizes rows whose values differ between the products. */
export let compareHighlightDifferences = writable<boolean>(
	LocalStorageManager.getItem(LocalStorageKeys.CompareHighlightDifferences) ?? false
);

/** A page's mobile action bar, rendered by the layout at the very bottom like the product page's. */
export const pageBottomBar = $state<{ snippet?: Snippet }>({});

export let searchQuery = writable(readSearchParams(location).get('q') || '');

export let theme = writable(LocalStorageManager.getItem(LocalStorageKeys.Theme) ?? '');
/** The user's own header buttons, null to follow defaultHeaderSlots */
export let headerSlots = writable<NavHref[] | null>(
	sanitizeHeaderSlots(LocalStorageManager.getItem(LocalStorageKeys.HeaderSlots))
);
export let preferredStoreId = writable(
	LocalStorageManager.getItem(LocalStorageKeys.PreferredStore) ?? ''
);
/** Category pages show only products available in the preferred store. */
export let onlyPreferredStore = writable<boolean>(
	LocalStorageManager.getItem(LocalStorageKeys.OnlyPreferredStore) ?? false
);
/** Last known device location, used to resolve the "auto" preferred store. */
export let userLocation = writable<{ latitude: number; longitude: number } | null>(
	LocalStorageManager.getItem(LocalStorageKeys.UserLocation) ?? null
);
/** True when the browser denied the location permission. */
export let locationDenied = writable(false);

export let isMobile = writable(window.matchMedia('(width < 48rem)').matches);
export let isLaptop = writable(window.matchMedia('(width < 1280px)').matches);

export let isSafari = writable(/^((?!chrome|android).)*safari/i.test(navigator.userAgent));
export let isFirefox = writable(navigator.userAgent.toLowerCase().indexOf('firefox') > -1);
export let isChrome = writable(navigator.userAgent.toLowerCase().indexOf('chrome') > -1);
