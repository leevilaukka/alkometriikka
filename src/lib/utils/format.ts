import type { ColumnNames } from "$lib/types";
import { AllColumns, filterToUnitMarker } from "./constants";

export type FormatOpts = {
    numberFormatOptions?: Intl.NumberFormatOptions;
    includeUnit?: boolean;
};

const formatters = new Map<ColumnNames, Intl.NumberFormat>();

console.log("formatters", formatters);

const defaultNumberFormatOptions: Intl.NumberFormatOptions = {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
};

const columnNumberFormatDefaults: Partial<Record<ColumnNames, Intl.NumberFormatOptions>> = {
    [AllColumns.Price]: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    [AllColumns.PricePerLiter]: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    [AllColumns.BottleSize]: { minimumFractionDigits: 0, maximumFractionDigits: 3 },
    [AllColumns.AlcoholPercentage]: { minimumFractionDigits: 0, maximumFractionDigits: 1 },
    [AllColumns.AlcoholGrams]: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    [AllColumns.AlcoholGramsPerEuro]: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    [AllColumns.EstimatedPromille]: { minimumFractionDigits: 3, maximumFractionDigits: 3 },
    [AllColumns.PromillePerEuro]: { minimumFractionDigits: 3, maximumFractionDigits: 3 },
    [AllColumns.Servings]: { minimumFractionDigits: 1, maximumFractionDigits: 2 },
    [AllColumns.EuroPerLiterAlcohol]: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    [AllColumns.Vintage]: { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: false },
};

for (const [column, options] of Object.entries(columnNumberFormatDefaults)) {
    formatters.set(
        column as ColumnNames,
        new Intl.NumberFormat("fi-FI", {
            ...defaultNumberFormatOptions,
            ...options,
        })
    );
}

export function formatValue(
    value: string | number | boolean | Set<string>,
    header?: ColumnNames,
    opts: FormatOpts = { includeUnit: true }
) {
    if (value instanceof Set) return Array.from(value).join(", ");
    if (value === Infinity || value === -Infinity) value = "∞";

    const includeUnit = opts.includeUnit ?? true;

    if (typeof value === "number") {
        const headerDefaults = header
            ? columnNumberFormatDefaults[header]
            : undefined;

        const numberFormatOptions: Intl.NumberFormatOptions = {
            ...defaultNumberFormatOptions,
            ...(headerDefaults ?? {}),
            ...(opts.numberFormatOptions ?? {}),
        };

        if (
            header &&
            formatters.has(header) &&
            !opts.numberFormatOptions
        ) {
            value = formatters.get(header)!.format(value);
        } else {
            value = new Intl.NumberFormat(
                "fi-FI",
                numberFormatOptions
            ).format(value);
        }
    }

    if (
        header &&
        Object.hasOwn(filterToUnitMarker, header) &&
        includeUnit
    ) {
        return `${value} ${filterToUnitMarker[header as keyof typeof filterToUnitMarker]}`;
    }

    return value;
}