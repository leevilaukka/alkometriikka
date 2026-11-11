import type { ColumnNames } from '$lib/types';
import {
	filterRenameMap,
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
	if (Object.hasOwn(filterRenameMap, header))
		return filterRenameMap[header as keyof typeof filterRenameMap];
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
	if (!header) return order ? 'Nouseva' : 'Laskeva';
	if (header in sortingOrderDescriptionMap) {
		return order
			? sortingOrderDescriptionMap[header as keyof typeof sortingOrderDescriptionMap][0]
			: sortingOrderDescriptionMap[header as keyof typeof sortingOrderDescriptionMap][1];
	}
	return order ? 'Nouseva' : 'Laskeva';
}

export function isNullish(value: unknown) {
	return value === null || value === undefined || value === '';
}
