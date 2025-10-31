
import { AllColumns, DatasetColumns, DrunkColumns, GenderOptionsMap } from '$lib/utils/constants';
import type { VariantProps } from 'class-variance-authority';
import type { components } from './utils/styles';
import type { IconName } from './icons';

export type ColumnType = "string" | "number" | "object" | "undefined" | "function" | "boolean" | "symbol" | "bigint";

export type DatasetRow = (string | number | undefined)[];

export type Filter = {
    type: ColumnType
    // Set of all possible types 
    possibleTypes: Set<ColumnType>
}

export type GenderOptions = typeof GenderOptionsMap[keyof typeof GenderOptionsMap];

export type PersonalInfo = {
    weight: number | null;
    gender: GenderOptions;
};

export interface PriceListItem extends Record<DrunkColumnNames, number> {
    "Numero": string;
    "Nimi": string;
    "Valmistaja": string;
    "Pullokoko": number;
    "Hinta": number;
    "Litrahinta": number;
    "Uutuus": "uutuus" | "";
    "Hinnastojärjestyskoodi": string;
    "Tyyppi": string;
    "Alatyyppi": string;
    "Erityisryhmä": string;
    "Oluttyyppi": string;
    "Valmistusmaa": string;
    "Alue": string;
    "Vuosikerta": string;
    "Etikettimerkintöjä": string;
    "Huomautus": Set<string>;
    "Rypäleet": Set<string>;
    "Luonnehdinta": Set<string>;
    "Pakkaustyyppi": string;
    "Alkoholi-%": number;
    "Hapot g/l": number;
    "Sokeri g/l": number;
    "Kantavierrep-%": number;
    "Väri EBC": number;
    "Katkerot EBU": number;
    "Energia kcal/100ml": number;
    "Valikoima": string;
    "EAN": string;
    [key: string]: string | number | Set<string>;
} 

export type DatasetColumnNames = typeof DatasetColumns[keyof typeof DatasetColumns];
export type DrunkColumnNames = typeof DrunkColumns[keyof typeof DrunkColumns];
export type ColumnNames = typeof AllColumns[keyof typeof AllColumns];

export type ColNameObj<T> = { [key in ColumnNames]?: T };

export type ListObj = {
    id: string;
    name: string;
    items: {
        id: string;
        q: number;
    }[];
}

export type BadgeConfig = { text: string; color?: VariantProps<typeof components.badge>["color"]; icon?: IconName };
export type ColumnBadgeMap = Partial<Record<ColumnNames, BadgeConfig | Record<string, BadgeConfig>>>;

export type FilterValue = (string | number)[];
export type FilterValues = { [key in ColumnNames]: FilterValue };