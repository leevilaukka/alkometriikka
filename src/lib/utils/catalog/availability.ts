import type { AvailabilityData, AvailabilityStore } from '$lib/types';
import { AUTO_STORE_ID } from '../constants/app';
import { intlLocale, locale, m } from '$lib/i18n';
import { readStockedStores } from './availabilityFile';

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

/** Resolves the preferred store setting, where `AUTO_STORE_ID` means the store nearest to `location`. */
export function resolvePreferredStore(
	stores: Record<string, AvailabilityStore>,
	preferredStoreId: string,
	location: Coordinates | null
): AvailabilityStore | undefined {
	if (preferredStoreId !== AUTO_STORE_ID) return stores[preferredStoreId];
	if (!location) return undefined;

	const origin = { id: '', name: '', ...location };
	return rankStoresByDistance(Object.values(stores), origin).find((store) => hasCoordinates(store));
}

export function rankStoresByDistance(
	stores: AvailabilityStore[],
	origin: AvailabilityStore | undefined
): AvailabilityStore[] {
	return [...stores].sort((first, second) => {
		const firstDistance = getStoreDistance(origin, first);
		const secondDistance = getStoreDistance(origin, second);

		if (firstDistance === null && secondDistance === null) {
			return compareStoreNames(first.name, second.name);
		}
		if (firstDistance === null) return 1;
		if (secondDistance === null) return -1;

		return firstDistance - secondDistance || compareStoreNames(first.name, second.name);
	});
}

export function formatStoreDistance(distance: number | null): string | null {
	if (distance === null) return null;
	if (distance < 10)
		return `${distance.toLocaleString(intlLocale, { maximumFractionDigits: 1 })} km`;
	return `${Math.round(distance).toLocaleString(intlLocale)} km`;
}

type StoreTextField =
	| 'name'
	| 'address'
	| 'postOffice'
	| 'additional_info'
	| 'location_details'
	| 'unobstructured'
	| 'exceptions';

/**
 * A store's name, address or post office as shown in the current language. Alko has Swedish
 * versions of these (`name_sv`, …); English uses the Finnish ones. The Finnish `name` stays the
 * store's identity everywhere else, e.g. in the store filter's URL values.
 */
export function storeText(store: AvailabilityStore, field: StoreTextField): string {
	const finnish = store[field] ?? '';
	if (locale !== 'sv') return finnish;
	const swedish = store[`${field}_sv`];
	return typeof swedish === 'string' && swedish.trim() ? swedish : finnish;
}

/** Shorthand for the store's name in the current language. */
/**
 * Orders store names alphabetically the Finnish way (Ä and Ö after Z), whatever the language:
 * English collation would sort them in among the As and Os.
 */
export function compareStoreNames(first: string, second: string): number {
	return first.localeCompare(second, locale === 'sv' ? 'sv-FI' : 'fi-FI');
}

export function storeName(store: AvailabilityStore): string {
	return storeText(store, 'name');
}

/** Opening hours as shown, e.g. "10–21", with Alko's "Kiinni" (closed) in the current language. */
export function formatOpeningHours(hours: string): string {
	return hours.trim().toLowerCase() === 'kiinni' ? m.store_closed() : hours;
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
 * The store's regular hours on `date` (YYYY-MM-DD) from Alko's normal calendar,
 * or `null` if the date is outside it. `openHours` already has exceptions such
 * as holidays applied, so a day whose hours differ from this is an exception.
 */
export function getNormalOpeningHours(store: AvailabilityStore, date: string): string | null {
	const openingHours = store.openHoursNormal?.find((entry) => entry.date === date)?.hours;
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
	if (openingHours === null || openingHours.toLowerCase() === 'kiinni') return false;

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

/**
 * Alko's `unobstructured` field normally just says "esteetön" (accessible), but
 * some stores put a notice in it with "esteetön" glued to the end ("…Alko
 * Posio.esteetön"). Splits it into the notice and whether the store is
 * accessible; a notice without any letters (".") is dropped.
 */
export function parseStoreAccessibility(value: string | undefined): {
	notice: string | null;
	accessible: boolean;
} {
	const text = value?.trim() ?? '';
	const match = /^([\s\S]*?)\s*esteetön$/i.exec(text);
	const accessible = match !== null && !/(^|\s)ei$/i.test(match[1]);
	const notice = accessible ? match[1].trim() : text;

	return { notice: /\p{L}/u.test(notice) ? notice : null, accessible };
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

/**
 * Validates a parsed `availability.json` and unpacks its product map (see
 * `availabilityFile.ts`): drops malformed stores and product entries, and stores
 * of outlet type 2 (not shown in the app).
 */
export function parseAvailability(data: unknown): AvailabilityData {
	const raw = data as (Partial<AvailabilityData> & { storeIds?: unknown }) | null;
	const product = raw && typeof raw === 'object' ? readStockedStores(raw) : null;
	if (!raw || !raw.stores || !product) {
		throw new Error(m.error_availability_invalid());
	}

	const stores = Object.fromEntries(
		Object.entries(raw.stores).filter(
			(entry): entry is [string, AvailabilityStore] =>
				!!entry[1] &&
				typeof entry[1] === 'object' &&
				typeof entry[1].id === 'string' &&
				typeof entry[1].name === 'string' &&
				entry[1].outletType !== '2'
		)
	);

	return { lastUpdated: raw.lastUpdated, stores, product };
}
