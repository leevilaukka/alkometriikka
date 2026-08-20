import type { AvailabilityStore } from '$lib/types';

type Coordinates = {
	latitude: number;
	longitude: number;
};

const EARTH_RADIUS_KM = 6371;
const STORE_TIME_ZONE = 'Europe/Helsinki';
const STORE_DATE_FORMATTER = new Intl.DateTimeFormat('en', {
	timeZone: STORE_TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

function getStoreLocalDate(date: Date): string {
	const parts = STORE_DATE_FORMATTER.formatToParts(date);
	const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

	return `${values.year}-${values.month}-${values.day}`;
}

function hasCoordinates(
	store: AvailabilityStore | undefined
): store is AvailabilityStore & Coordinates {
	return (
		store !== undefined &&
		typeof store.latitude === 'number' &&
		Number.isFinite(store.latitude) &&
		typeof store.longitude === 'number' &&
		Number.isFinite(store.longitude)
	);
}

function toRadians(degrees: number): number {
	return degrees * (Math.PI / 180);
}

export function getStoreDistance(
	origin: AvailabilityStore | undefined,
	destination: AvailabilityStore | undefined
): number | null {
	if (!hasCoordinates(origin) || !hasCoordinates(destination)) return null;

	const latitudeDelta = toRadians(destination.latitude - origin.latitude);
	const longitudeDelta = toRadians(destination.longitude - origin.longitude);
	const originLatitude = toRadians(origin.latitude);
	const destinationLatitude = toRadians(destination.latitude);
	const haversine =
		Math.sin(latitudeDelta / 2) ** 2 +
		Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;

	return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function rankStoresByDistance(
	stores: AvailabilityStore[],
	origin: AvailabilityStore | undefined
): AvailabilityStore[] {
	return [...stores].sort((first, second) => {
		const firstDistance = getStoreDistance(origin, first);
		const secondDistance = getStoreDistance(origin, second);

		if (firstDistance === null && secondDistance === null) {
			return first.name.localeCompare(second.name, 'fi', { sensitivity: 'base' });
		}
		if (firstDistance === null) return 1;
		if (secondDistance === null) return -1;

		return (
			firstDistance - secondDistance ||
			first.name.localeCompare(second.name, 'fi', { sensitivity: 'base' })
		);
	});
}

export function formatStoreDistance(distance: number | null): string | null {
	if (distance === null) return null;
	if (distance < 10) return `${distance.toLocaleString('fi-FI', { maximumFractionDigits: 1 })} km`;
	return `${Math.round(distance).toLocaleString('fi-FI')} km`;
}

export function getTodaysOpeningHours(
	store: AvailabilityStore,
	date: Date = new Date()
): string | null {
	const openingHours = store.openHours?.find(
		(entry) => entry.date === getStoreLocalDate(date)
	)?.hours;
	if (typeof openingHours !== 'string') return null;

	return openingHours.trim() || null;
}
