
import { AllColumns, DatasetColumns, DrunkColumns, GenderOptionsMap } from '$lib/utils/constants';
import type { VariantProps } from 'class-variance-authority';
import type { components } from './utils/styles';
import type { IconName } from './icons';

export type NativeTypes = "string" | "number" | "object" | "undefined" | "function" | "boolean" | "symbol" | "bigint" | "any";

export type DatasetRow = (string | number | undefined)[];

export type Filter = {
    type: NativeTypes | "any" | undefined
    // Set of all possible types 
    possibleTypes: Set<NativeTypes>
}

export type GenderOptions = typeof GenderOptionsMap[keyof typeof GenderOptionsMap];

export type PersonalInfo = {
    weight: number | null;
    gender: GenderOptions;
};

export interface PriceListItem {
    "Numero": string;
    "Nimi": string;
    "Valmistaja": string;
    "Pullokoko": string | number;
    "Hinta": string | number;
    "Litrahinta": string | number;
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
    "Huomautus": string;
    "Rypäleet": string;
    "Luonnehdinta": string;
    "Pakkaustyyppi": string;
    "Alkoholi-%": string | number;
    "Hapot g/l": string;
    "Sokeri g/l": string;
    "Kantavierrep-%": string;
    "Väri EBC": string;
    "Katkerot EBU": string;
    "Energia kcal/100ml": string;
    "Valikoima": string;
    "EAN": string;
    [key: string]: string | number; // Allow other properties with string keys and values of type string or number
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