import { resolve } from '$app/paths';
import { DatasetColumns } from '$lib/utils/constants';
import type { ColumnNames } from '$lib/types';
import { Kaljakori } from '$lib/alko';
import { personalInfo } from '$lib/global.svelte';
import { dev } from '$app/env';

export const ssr = false;
export const prerender = false;
    
function getDatasetURL() {
    return resolve("/") + "data.json";
}

if(dev) localStorage.setItem("umami.disabled", "1");

type Fetch = (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>

async function fetchAlkoPriceList({ fetch }: { fetch: Fetch; }) {
    const req = await fetch(getDatasetURL());
    if (!req.ok) {
        throw new Error(`Hinnaston lataaminen epäonnistui: ${req.status} ${req.statusText}`);
    }
    const text = await req.text();
    return text;
}

type MigratedProduct = {
    values: unknown[];
    priceHistory?: { date: string; price: number }[];
    meta?: { removedFromSelection?: string };
};

type Dataset = {
    schema?: unknown;
    metadata?: { LastUpdated?: string; LastSynced?: string };
    products?: Record<string, MigratedProduct>;
};

function formatDatasetToJSON(data: string) {
    try {
        const { schema, metadata: datasetMeta, products = {} } = JSON.parse(data) as Dataset;
        if (!Array.isArray(schema) || schema.length === 0) {
            throw new Error("Hinnasto on tyhjä tai väärässä muodossa");
        }
        // Validate that all columns in the dataset are known
        const knownColumns = Object.values(DatasetColumns) as ColumnNames[];
        if (schema[0] !== DatasetColumns.Number) throw new Error("Hinnasto on tyhjä tai väärässä muodossa");
        schema.forEach((column: unknown) => {
            if (!knownColumns.includes(column as ColumnNames)) throw new Error(`Tuntematon sarake datassa: ${column}`);
        });

        // The new format stores each product under its id and keeps price history
        // in a separate `priceHistory` field. Rebuild the table shape the app
        // expects: a header row plus one row per product with the price history
        // appended as the "Hintahistoria" column. Every product is kept —
        // including ones no longer in Alko's selection — so nothing disappears
        // from the UI. Whether a product has been removed from the selection is
        // recorded in `meta.removedFromSelection` and appended as its own column.
        const header = [...schema, DatasetColumns.History, DatasetColumns.RemovedFromSelection];

        let latestDate: string | undefined;
        const rows = Object.values(products)
            .filter((product): product is MigratedProduct =>
                !!product && typeof product === "object" && Array.isArray(product.values)
            )
            .map((product) => {
                const priceHistory = Array.isArray(product.priceHistory) ? product.priceHistory : [];
                for (const point of priceHistory) {
                    if (point?.date && (!latestDate || point.date > latestDate)) latestDate = point.date;
                }
                const removedFromSelection = Boolean(product.meta?.removedFromSelection);
                return [...product.values, priceHistory, removedFromSelection];
            });

        if (rows.length === 0) {
            throw new Error("Hinnasto on tyhjä tai väärässä muodossa");
        }

        // Prefer the dataset's recorded last-modified date; fall back to the
        // newest price-history entry for older datasets without metadata.
        const metadata = datasetMeta ? { ...datasetMeta } : {};

        return {
            table: [header, ...rows],
            metadata
        };
    } catch(e) {
        if (e instanceof Error) throw e;
        throw new Error("Hinnaston lataus epäonnistui");
    }
}

async function getDataset({ fetch }: { fetch: Fetch; }) {
    const data = await fetchAlkoPriceList({ fetch });
    const json = formatDatasetToJSON(data);
    return json;
}

async function getData({ fetch }: { fetch: Fetch; }) {
    return new Promise<{ dataset: { table: any[]; metadata: Record<string, unknown>; }; kaljakori: Kaljakori; }>(async (resolve, reject) => {
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