import { locationDenied, userLocation } from '$lib/global.svelte';

/** Asks the browser for the device location, keeping the last known one if it's denied or unavailable. */
export function requestUserLocation() {
	if (typeof navigator === 'undefined' || !navigator.geolocation) return;

	navigator.geolocation.getCurrentPosition(
		({ coords }) => {
			locationDenied.set(false);
			userLocation.set({ latitude: coords.latitude, longitude: coords.longitude });
		},
		(error) => locationDenied.set(error.code === error.PERMISSION_DENIED),
		{ maximumAge: 10 * 60 * 1000, timeout: 10000 }
	);
}
