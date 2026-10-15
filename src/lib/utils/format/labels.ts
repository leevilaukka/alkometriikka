import type { ColumnNames } from '$lib/types';
import { m } from '$lib/i18n';
import { GenderOptionsMap } from '../constants/app';
import {
	columnDisplayNames,
	filterToUnitMarker,
	sortingOrderDescriptionMap
} from '../constants/display';
import { formatValue, type FormatOpts } from './format';

export function headerToUnitMarker(header: ColumnNames) {
	if (Object.hasOwn(filterToUnitMarker, header))
		return filterToUnitMarker[header as keyof typeof filterToUnitMarker];
	return '';
}

export function headerToDisplayName(header: ColumnNames) {
	if (Object.hasOwn(columnDisplayNames, header))
		return columnDisplayNames[header as keyof typeof columnDisplayNames];
	return header;
}

export function valueToString(
	value: string | number | boolean | Set<string>,
	header?: ColumnNames,
	opts: FormatOpts = { numberFormatOptions: undefined, includeUnit: true }
) {
	if (!header) return String(formatValue(value, undefined, opts));
	return `${headerToDisplayName(header)}: ${formatValue(value, header, opts)}`;
}

export function sortingOrderToString(order: boolean, header?: ColumnNames) {
	if (!header) return order ? m.sort_ascending() : m.sort_descending();
	if (header in sortingOrderDescriptionMap) {
		return order
			? sortingOrderDescriptionMap[header as keyof typeof sortingOrderDescriptionMap][0]
			: sortingOrderDescriptionMap[header as keyof typeof sortingOrderDescriptionMap][1];
	}
	return order ? m.sort_ascending() : m.sort_descending();
}

const genderLabels: Record<string, () => string> = {
	[GenderOptionsMap.Male]: m.gender_male,
	[GenderOptionsMap.Female]: m.gender_female,
	[GenderOptionsMap.Unspecified]: m.gender_other
};

/** The stored gender options are Finnish words; this is how each is shown. */
export function genderLabel(value: string): string {
	return genderLabels[value]?.() ?? value;
}

export function isNullish(value: unknown) {
	return value === null || value === undefined || value === '';
}
