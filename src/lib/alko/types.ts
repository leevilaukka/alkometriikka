
import { AllColumns, DatasetColumns, DrunkColumns } from '$lib/utils/constants';

export type NativeTypes = "string" | "number" | "object" | "undefined" | "function" | "boolean" | "symbol" | "bigint";

export type Filter = {
    type: NativeTypes | "any" | undefined
    // Set of all possible types 
    possibleTypes: Set<NativeTypes>
}

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