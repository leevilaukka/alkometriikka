
import { AllColumns, DatasetColumns, DrunkColumns, GenderOptionsMap, ShareTypes } from '$lib/utils/constants';
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
    gender: GenderOptions | undefined | null;
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
    "Hintahistoria": { date: string; price: number }[];
    "Poistunut valikoimasta": boolean;
    [key: string]: string | number | boolean | Set<string> | { date: string; price: number }[];
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

export type OgProperties = {
    title: string;
    type?: 'website';
    description: string;
    url: string;
};

export type TwitterProperties = {
    title: string;
    description: string;
    image: string;
    card: 'summary_large_image';
    site?: string;
    creator?: string;
};

export type OGImage = {
    url: string;
    width: string | number;
    height: string | number;
    alt: string;
};

export type BadgeConfig = { text: string; color?: VariantProps<typeof components.badge>["color"]; icon?: IconName };
export type ColumnBadgeMap = Partial<Record<ColumnNames, BadgeConfig | Record<string, BadgeConfig>>>;

export type FilterValue = (string | number)[];
export type FilterValues = { [key in ColumnNames]: FilterValue };

export type ImageTransform = "products" | "medium" | "pdp";

export type ShareType = typeof ShareTypes[keyof typeof ShareTypes];

export type ShareEvent = `share_${ShareType}`;
export type ShareViewEvent = `shared_${ShareType}_viewed`; 

export type AnalyticsEventMap = {
    'open_settings': undefined;
    'export_data': undefined;
    'import_data': undefined;
    'create_list': undefined;
    'save_list': { url?: string };
    'view_sizes': { product_number: string };
    'show_price_history': { product_number?: string; [key: string]: any };
    'scan_barcode': { ean: string; link?: string };
    'scan_qr_code': { type: string; product_number: string; link?: string };
} & {
    [K in ShareEvent]: { url?: string; sid?: string; [key: string]: any };
} & {
    [K in ShareViewEvent]: { url?: string; sid?: string; [key: string]: any };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;