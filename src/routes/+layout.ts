import { resolve } from '$app/paths';
import { DatasetColumns } from '$lib/utils/constants';
import type { ColumnNames } from '$lib/types';
import { Kaljakori } from '$lib/alko';
import { personalInfo } from '$lib/global.svelte';
import { decompressFromUTF16 } from 'lz-string';
import type { FullProperties } from 'xlsx';

export const ssr = false;
export const prerender = false;
    
function getDatasetURL() {
    return resolve("/") + "data.txt";
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>

async function fetchAlkoPriceList({ fetch }: { fetch: Fetch; }) {
    const req = await fetch(getDatasetURL());
    if (!req.ok) {
        throw new Error(`Hinnaston lataaminen epäonnistui: ${req.status} ${req.statusText}`);
    }
    const text = await req.text();
    return text;
}

function formatDatasetToJSON(data: string) {
    const decompressed = decompressFromUTF16(data);
    try {
        const { table, metadata } = JSON.parse(decompressed);
        if (!table) throw new Error("Hinnaston purku epäonnistui");
        if (table.length === 0) {
            throw new Error("Hinnasto on tyhjä tai väärässä muodossa");
        }
        // Validate that all columns in the dataset are known
        const knownColumns = Object.values(DatasetColumns) as ColumnNames[];
        if (table[0][0] !== DatasetColumns.Number) throw new Error("Hinnasto on tyhjä tai väärässä muodossa");
        table[0].forEach((column: typeof DatasetColumns[keyof typeof DatasetColumns]) => {
            if (!knownColumns.includes(column)) throw new Error(`Tuntematon sarake datassa: ${column}`);
        });
        return {
            table,
            metadata
        };
    } catch(e) {
        throw "Hinnaston lataus epäonnistui"
    }
}

async function getDataset({ fetch }: { fetch: Fetch; }) {
    const data = await fetchAlkoPriceList({ fetch });
    const json = formatDatasetToJSON(data);
    return json;
}

async function getData({ fetch }: { fetch: Fetch; }) {
    return new Promise<{ dataset: { table: any[]; metadata: FullProperties; }; kaljakori: Kaljakori; }>(async (resolve, reject) => {
        try {
            const dataset = await getDataset({ fetch });
            resolve({ dataset, kaljakori: new Kaljakori(dataset.table, personalInfo) });
        } catch (error) { 
            reject(error);
        }
    });
}

export async function load({ fetch }: { fetch: Fetch }) {
    
	return { alko: getData({ fetch }) };
};