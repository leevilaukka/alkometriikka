import type { PageLoad } from './$types';
import * as XLSX from 'xlsx';
import { resolve } from '$app/paths';
import { dev } from '$app/environment';
import { DatasetColumns } from '$lib/utils/constants';
import type { ColumnNames } from '$lib/types';

export const ssr = false;
export const prerender = false;
    
function corsProxy(url: string) {
    return "https://corsproxy.io/?url=" + url
}

function getDatasetURL() {
    if(dev) return corsProxy("https://alkometriikka.fi/alkon-hinnasto-tekstitiedostona.xlsx")
    return resolve("/") + "alkon-hinnasto-tekstitiedostona.xlsx"
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>

const fetchAlkoPriceList = async ({ fetch }: {fetch: Fetch}) => {
    console.log("Fetching Alko price list...");
    const req = await fetch(getDatasetURL());
    if (!req.ok) {
        throw new Error(`Hinnaston lataaminen epäonnistui: ${req.status} ${req.statusText}`);
    }
    const arrayBuffer = await req.arrayBuffer();
    return arrayBuffer;
}

const getFileMetadata = (workbook: XLSX.WorkBook) => {
    return workbook.Props;
}

const formatXLSXToJSON = (data: ArrayBuffer) => {
    const workbook = XLSX.read(data);
    const metadata = getFileMetadata(workbook);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (sheet === undefined) {
        throw new Error("Hinnasto on tyhjä tai väärässä muodossa");
    }
    const dataset: any[] = XLSX.utils.sheet_to_json(sheet, {
        range: 3,
        defval: undefined,
        header: 1
    })
    if (dataset.length === 0) {
        throw new Error("Hinnasto on tyhjä tai väärässä muodossa");
    }
    // Validate that all columns in the dataset are known
    const knownColumns = Object.values(DatasetColumns) as ColumnNames[];
    if(dataset[0][0] !== DatasetColumns.Number) throw new Error("Hinnasto on tyhjä tai väärässä muodossa");
    dataset[0].forEach((column: typeof DatasetColumns[keyof typeof DatasetColumns]) => {
        if(!knownColumns.includes(column)) throw new Error(`Tuntematon sarake datassa: ${column}`);
    })
    return {
        table: dataset,
        metadata
    }
}

const getDataset = async ({ fetch }: { fetch: Fetch }) => {
    const xlsx = await fetchAlkoPriceList({ fetch });
    const json = formatXLSXToJSON(xlsx);
    return json
}

export const load: PageLoad = async ({ fetch } : { fetch: Fetch }) => {
	return { dataset: getDataset({ fetch }) };
};