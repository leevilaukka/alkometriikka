import { get } from 'svelte/store';
import { locationDenied, userLocation } from '$lib/global.svelte';
import { LocalStorageKeys } from '$lib/utils/constants';
import { LocalStorageManager } from '$lib/utils/storage';

/** A saved location newer than this is reused instead of asking the browser again. */
const MAX_LOCATION_AGE_MS = 10 * 60 * 1000;

function hasFreshLocation() {
	const updatedAt = LocalStorageManager.getItem(LocalStorageKeys.UserLocationUpdatedAt);
	return (
		!!get(userLocation) &&
		typeof updatedAt === 'number' &&
		Date.now() - updatedAt < MAX_LOCATION_AGE_MS
	);
}

/**
 * Asks the browser for the device location, keeping the last known one if it's denied or unavailable.
 * Skips the request when a recent location is already saved, so the browser's location indicator
 * isn't triggered needlessly.
 */
export function requestUserLocation() {
	if (typeof navigator === 'undefined' || !navigator.geolocation) return;
	if (hasFreshLocation()) return;

	navigator.geolocation.getCurrentPosition(
		({ coords }) => {
			locationDenied.set(false);
			userLocation.set({ latitude: coords.latitude, longitude: coords.longitude });
			LocalStorageManager.setItem(LocalStorageKeys.UserLocationUpdatedAt, Date.now());
		},
		(error) => locationDenied.set(error.code === error.PERMISSION_DENIED),
		{ maximumAge: MAX_LOCATION_AGE_MS, timeout: 10000 }
	);
}

/**
 * Keeps the location up to date for views that resolve the "auto" preferred store.
 * Returns a cleanup function, so it can be returned straight from an `$effect`.
 */
export function keepAutoLocationFresh() {
	requestUserLocation();
	// Refresh when the tab regains focus, since the user may have moved in the meantime.
	const refresh = () => {
		if (document.visibilityState === 'visible') requestUserLocation();
	};
	document.addEventListener('visibilitychange', refresh);
	return () => document.removeEventListener('visibilitychange', refresh);
}
