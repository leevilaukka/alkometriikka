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
const STORE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
	timeZone: STORE_TIME_ZONE,
	hour: '2-digit',
	minute: '2-digit',
	hour12: false
});

function getStoreLocalDate(date: Date): string {
	const parts = STORE_DATE_FORMATTER.formatToParts(date);
	const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

	return `${values.year}-${values.month}-${values.day}`;
}

/** Returns the number of minutes since midnight, in the store's local time zone. */
function getStoreLocalMinutes(date: Date): number {
	const parts = STORE_TIME_FORMATTER.formatToParts(date);
	const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
	const hour = Number(values.hour);
	const minute = Number(values.minute);

	return hour * 60 + minute;
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

/**
 * Parses a single `HH`, `HH:MM`, `HH.MM`, or `H` clock time (as used in Alko's
 * opening hours strings) into minutes since midnight, or `null` if it isn't a
 * valid time.
 */
function parseClockTimeToMinutes(time: string): number | null {
	const [hourPart, minutePart] = time.split(/[:.]/);
	const hour = Number(hourPart);
	const minute = minutePart === undefined ? 0 : Number(minutePart);

	if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

	return hour * 60 + minute;
}

export function isStoreOpen(store: AvailabilityStore, date: Date = new Date()): boolean {
	const openingHours = getTodaysOpeningHours(store, date);
	if (openingHours === 'kiinni' || openingHours === null) return false;

	// Alko's API returns ranges like "9–21" (en dash, hour-only, no leading
	// zero or minutes), but may also use a plain hyphen and/or "HH:MM" times.
	const [openTime, closeTime] = openingHours.split(/[-–—]/).map((time) => time.trim());
	if (!openTime || !closeTime) return false;

	const openMinutes = parseClockTimeToMinutes(openTime);
	const closeMinutes = parseClockTimeToMinutes(closeTime);
	if (openMinutes === null || closeMinutes === null) return false;

	const nowMinutes = getStoreLocalMinutes(date);

	return nowMinutes >= openMinutes && nowMinutes <= closeMinutes;
}

export function getStoreCity(store: AvailabilityStore): string {
	if (!store) return '';
	if (typeof store.postOffice === 'string' && store.postOffice.trim() !== '') {
		return store.postOffice.trim();
	}

	if (typeof store.address === 'string' && store.address.trim() !== '') {
		const addressParts = store.address.split(',');
		if (addressParts.length > 1) {
			return addressParts[addressParts.length - 1].trim();
		}
	}

	return '';
}
