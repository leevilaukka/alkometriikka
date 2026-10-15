import type { ColumnNames } from '$lib/types';
import { AllColumns } from '../constants/columns';
import { filterToUnitMarker, timeConfig } from '../constants/display';
import { intlLocale, m } from '$lib/i18n';
import { translateValue } from '$lib/i18n/values';

export type FormatOpts = {
	numberFormatOptions?: Intl.NumberFormatOptions;
	includeUnit?: boolean;
};

const formatters = new Map<ColumnNames, Intl.NumberFormat>();
const extraFormatters = new Map<string, Intl.NumberFormat>();

const defaultNumberFormatOptions: Intl.NumberFormatOptions = {
	maximumFractionDigits: 3,
	minimumFractionDigits: 0
};

const columnNumberFormatDefaults: Partial<Record<ColumnNames, Intl.NumberFormatOptions>> = {
	[AllColumns.Price]: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
	[AllColumns.PricePerLiter]: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
	[AllColumns.NormalPrice]: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
	[AllColumns.BottleSize]: { minimumFractionDigits: 0, maximumFractionDigits: 3 },
	[AllColumns.AlcoholPercentage]: { minimumFractionDigits: 0, maximumFractionDigits: 1 },
	[AllColumns.AlcoholGrams]: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
	[AllColumns.AlcoholGramsPerEuro]: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
	[AllColumns.EstimatedPromille]: { minimumFractionDigits: 3, maximumFractionDigits: 3 },
	[AllColumns.PromillePerEuro]: { minimumFractionDigits: 3, maximumFractionDigits: 3 },
	[AllColumns.Servings]: { minimumFractionDigits: 1, maximumFractionDigits: 2 },
	[AllColumns.EuroPerLiterAlcohol]: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
	[AllColumns.Vintage]: { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: false },
	[AllColumns.Number]: { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: false },
	[AllColumns.BitternessEBU]: { minimumFractionDigits: 0, maximumFractionDigits: 1 },
	[AllColumns.Energy]: { minimumFractionDigits: 0, maximumFractionDigits: 1 },
	[AllColumns.Sugar]: { minimumFractionDigits: 0, maximumFractionDigits: 1 },
	[AllColumns.Acidity]: { minimumFractionDigits: 0, maximumFractionDigits: 1 },
	[AllColumns.OriginalGravity]: { minimumFractionDigits: 0, maximumFractionDigits: 1 }
};

for (const [column, options] of Object.entries(columnNumberFormatDefaults)) {
	formatters.set(
		column as ColumnNames,
		new Intl.NumberFormat(intlLocale, {
			...defaultNumberFormatOptions,
			...options
		})
	);
}

export function formatValue(
	value: string | number | boolean | Set<string>,
	header?: ColumnNames,
	opts: FormatOpts = { includeUnit: true }
) {
	// Only values of a known column are translated, so free text is never mistaken for a label
	if (value instanceof Set)
		return Array.from(value, (member) => (header ? translateValue(member, header) : member)).join(
			', '
		);
	if (typeof value === 'string' && header) value = translateValue(value, header);
	if (value === Infinity || value === -Infinity) value = '∞';

	const includeUnit = opts.includeUnit ?? true;

	if (typeof value === 'number') {
		const headerDefaults = header ? columnNumberFormatDefaults[header] : undefined;

		const numberFormatOptions: Intl.NumberFormatOptions = {
			...defaultNumberFormatOptions,
			...(headerDefaults ?? {}),
			...(opts.numberFormatOptions ?? {})
		};

		if (header && formatters.has(header) && !opts.numberFormatOptions) {
			value = formatters.get(header)!.format(value);
		} else {
			const key = `${header ?? 'default'}-${JSON.stringify(numberFormatOptions)}`;
			if (!extraFormatters.has(key)) {
				extraFormatters.set(key, new Intl.NumberFormat(intlLocale, numberFormatOptions));
			}
			const formatter = extraFormatters.get(key);
			value = formatter!.format(value);
		}
	}

	if (header && Object.hasOwn(filterToUnitMarker, header) && includeUnit) {
		return `${value} ${filterToUnitMarker[header as keyof typeof filterToUnitMarker]}`;
	}

	return value;
}

/** Price per liter without decimals, e.g. "24 €/L", for compact chart labels. */
export function formatRoundedPricePerLiter(value: number): string {
	return String(
		formatValue(value, AllColumns.PricePerLiter, {
			numberFormatOptions: { minimumFractionDigits: 0, maximumFractionDigits: 0 }
		})
	);
}

const relativeTimeFormatter = new Intl.RelativeTimeFormat(intlLocale, { numeric: 'auto' });

const relativeTimeUnits: [Intl.RelativeTimeFormatUnit, number][] = [
	['day', 86_400_000],
	['hour', 3_600_000],
	['minute', 60_000]
];

/** Relative time in the current language, e.g. "3 tuntia sitten" or "eilen". */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
	const diff = date.getTime() - now.getTime();
	for (const [unit, ms] of relativeTimeUnits) {
		if (Math.abs(diff) >= ms) return relativeTimeFormatter.format(Math.round(diff / ms), unit);
	}
	return m.time_just_now();
}

/** A number in the current language's notation, e.g. "1 234,5" in Finnish. */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
	return value.toLocaleString(intlLocale, options);
}

/** A date in the current language's short notation, e.g. "15.10.2026" in Finnish. */
export function formatDate(
	date: Date | string | number,
	options?: Intl.DateTimeFormatOptions
): string {
	return new Date(date).toLocaleDateString(intlLocale, options);
}

/** A time of day in Finnish time, e.g. "14.30" in Finnish. */
export function formatTime(date: Date | string | number): string {
	return new Date(date).toLocaleTimeString(intlLocale, timeConfig);
}

/** A date and time, e.g. "15.10.2026 klo 14.30" in Finnish. */
export function formatDateTime(date: Date | string | number): string {
	return m.date_at_time({ date: formatDate(date), time: formatTime(date) });
}
