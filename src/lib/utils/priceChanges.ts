// Shared bits of the price change lists: the category page's sidebar list and
// the site-wide /hinnanmuutokset page.

import type { PriceListItem } from '$lib/types';
import { categorySlug } from './categories';
import { AllColumns } from './constants';
import type { PriceChange } from './metrics';
import { toISODateInTimeZone } from './sales';

/** Window choices on the price changes page, in days. */
export const PRICE_CHANGE_WINDOWS = [7, 30, 90] as const;
export type PriceChangeWindow = (typeof PRICE_CHANGE_WINDOWS)[number];
export const DEFAULT_PRICE_CHANGE_WINDOW: PriceChangeWindow = 30;

export type PriceChangeDirection = 'all' | 'down' | 'up';

/** `?suunta=` values in the URL. */
const DIRECTION_PARAMS: Record<Exclude<PriceChangeDirection, 'all'>, string> = {
	down: 'halpeni',
	up: 'kallistui'
};

/** First day (Helsinki time, `YYYY-MM-DD`) of a window of `days` ending now. */
export function priceChangeSince(days: number, now: Date = new Date()): string {
	return toISODateInTimeZone('Europe/Helsinki', new Date(now.getTime() - days * 864e5));
}

export function isPriceDrop(change: PriceChange): boolean {
	return change.to < change.from;
}

export function filterPriceChangesByDirection(
	changes: PriceChange[],
	direction: PriceChangeDirection
): PriceChange[] {
	if (direction === 'all') return changes;
	return changes.filter((change) => isPriceDrop(change) === (direction === 'down'));
}

/**
 * Whether a product belongs to a category, matched by slug like the category
 * pages do. Without a type slug every product matches.
 */
export function isInCategory(
	product: PriceListItem,
	typeSlug?: string,
	subTypeSlug?: string
): boolean {
	if (!typeSlug) return true;
	return (
		categorySlug(String(product[AllColumns.Type] ?? '')) === typeSlug &&
		(!subTypeSlug || categorySlug(String(product[AllColumns.SubType] ?? '')) === subTypeSlug)
	);
}

/**
 * Number of changes per category, keyed by type slug and by `type/subtype`,
 * for the counts on the category chips.
 */
export function countPriceChangesByCategory(changes: PriceChange[]): Map<string, number> {
	const counts = new Map<string, number>();
	const add = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
	for (const change of changes) {
		const typeSlug = categorySlug(String(change.product[AllColumns.Type] ?? ''));
		if (!typeSlug) continue;
		add(typeSlug);
		const subTypeSlug = categorySlug(String(change.product[AllColumns.SubType] ?? ''));
		if (subTypeSlug) add(`${typeSlug}/${subTypeSlug}`);
	}
	return counts;
}

/** Reads the page's `?pv=`, `?suunta=` and `?tyyppi=`/`?alatyyppi=` parameters, ignoring unknown values. */
export function parsePriceChangeParams(params: URLSearchParams): {
	days: PriceChangeWindow;
	direction: PriceChangeDirection;
	typeSlug?: string;
	subTypeSlug?: string;
} {
	const days = Number(params.get('pv'));
	const direction = params.get('suunta');
	const typeSlug = params.get('tyyppi') || undefined;
	return {
		days: PRICE_CHANGE_WINDOWS.find((value) => value === days) ?? DEFAULT_PRICE_CHANGE_WINDOW,
		direction:
			direction === DIRECTION_PARAMS.down
				? 'down'
				: direction === DIRECTION_PARAMS.up
					? 'up'
					: 'all',
		typeSlug,
		subTypeSlug: (typeSlug && params.get('alatyyppi')) || undefined
	};
}

/** The parameters {@link parsePriceChangeParams} reads, defaults left out (empty string). */
export function priceChangeParams(options: {
	days: number;
	direction: PriceChangeDirection;
	typeSlug?: string;
	subTypeSlug?: string;
}): Record<'pv' | 'suunta' | 'tyyppi' | 'alatyyppi', string> {
	return {
		pv: options.days === DEFAULT_PRICE_CHANGE_WINDOW ? '' : String(options.days),
		suunta: options.direction === 'all' ? '' : DIRECTION_PARAMS[options.direction],
		tyyppi: options.typeSlug ?? '',
		alatyyppi: (options.typeSlug && options.subTypeSlug) || ''
	};
}

/** Link to the price changes page with these choices, e.g. `/hinnanmuutokset?tyyppi=viinit`. */
export function priceChangesURL(options: Parameters<typeof priceChangeParams>[0]): string {
	const params = new URLSearchParams(
		Object.entries(priceChangeParams(options)).filter(([, value]) => value)
	).toString();
	return params ? `/hinnanmuutokset?${params}` : '/hinnanmuutokset';
}

/** "2026-10-05" → "5.10." */
export function formatPriceChangeDate(date: string): string {
	const [, month, day] = date.split('-');
	return `${Number(day)}.${Number(month)}.`;
}

/** 12.4 → "+12 %", -5 → "−5 %" (fi-FI uses the Unicode minus sign) */
export function formatPriceChangePercent(percent: number): string {
	return `${percent > 0 ? '+' : ''}${percent.toLocaleString('fi-FI', { maximumFractionDigits: 0 })} %`;
}

/** 40.17 → 35.98 gives "−4,19 €", a rise gets a "+" sign. */
export function formatPriceChangeAmount(change: PriceChange): string {
	const amount = change.to - change.from;
	return `${amount > 0 ? '+' : ''}${amount.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}
