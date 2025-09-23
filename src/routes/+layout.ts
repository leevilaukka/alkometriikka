import type { PageLoad } from './$types';
import * as XLSX from 'xlsx';
import { resolve } from '$app/paths';
import { dev } from '$app/environment';
import { DatasetColumns } from '$lib/utils/constants';
import type { ColumnNames } from '$lib/types';
import { Kaljakori } from '$lib/alko';
import { personalInfo } from '$lib/global.svelte';
import { decompress } from 'lz-string';

export const ssr = false;
export const prerender = false;
    
function corsProxy(url: string) {
    return "https://corsproxy.io/?url=" + url
}

function getDatasetURL() {
    if(dev) return corsProxy("https://alkometriikka.fi/data.txt")
    return resolve("/") + "data.txt";
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>

const fetchAlkoPriceList = async ({ fetch }: {fetch: Fetch}) => {
    console.log("Fetching Alko price list...");
    const req = await fetch(getDatasetURL());
    if (!req.ok) {
        throw new Error(`Hinnaston lataaminen epäonnistui: ${req.status} ${req.statusText}`);
    }
    const text = await req.text();
    return text;
}

const formatDatasetToJSON = (data: string) => {
    const { dataset: table, metadata } = JSON.parse(decompress(data));
    if(!table) throw new Error("Hinnaston purku epäonnistui");

    console.log(table)
    if (table.length === 0) {
        throw new Error("Hinnasto on tyhjä tai väärässä muodossa");
    }
    // Validate that all columns in the dataset are known
    const knownColumns = Object.values(DatasetColumns) as ColumnNames[];
    if(table[0][0] !== DatasetColumns.Number) throw new Error("Hinnasto on tyhjä tai väärässä muodossa");
    table[0].forEach((column: typeof DatasetColumns[keyof typeof DatasetColumns]) => {
        if(!knownColumns.includes(column)) throw new Error(`Tuntematon sarake datassa: ${column}`);
    })
    return {
        table,
        metadata
    }
}

const getDataset = async ({ fetch }: { fetch: Fetch }) => {
    const data = await fetchAlkoPriceList({ fetch });
    const json = formatDatasetToJSON(data);
    return json
}

const getData = async({ fetch }: { fetch: Fetch }) => {
    return new Promise(async (resolve, reject) => {
        try {
            const dataset = await getDataset({ fetch });
            resolve({ dataset, kaljakori: new Kaljakori(dataset.table, personalInfo) });
        } catch (error) { reject(error) }
    })
}

export const load: PageLoad = async ({ fetch } : { fetch: Fetch }) => {
	return getData({ fetch });
};