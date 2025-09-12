import type { PageLoad } from './$types';
import * as XLSX from 'xlsx';
import { resolve } from '$app/paths';
import { dev } from '$app/environment';

function corsProxy(url: string) {
    return "https://corsproxy.io/?url=" + url
}

const URL = dev ? corsProxy("https://github.com/leevilaukka/alkoassistentti/raw/refs/heads/gh-pages/alkon-hinnasto-tekstitiedostona.xlsx") : resolve("/") + "alkon-hinnasto-tekstitiedostona.xlsx";

type Fetch = (input: RequestInfo | URL, init?: RequestInit | undefined) => Promise<Response>

const fetchAlkoPriceList = async ({ fetch }: {fetch: Fetch}) => {
    console.log("Fetching Alko price list...");
    const req = await fetch(URL);
    if (!req.ok) {
        throw new Error("Failed to fetch Alko price list");
    }
    console.log("Alko price list fetched successfully");
    const arrayBuffer = await req.arrayBuffer();
    return arrayBuffer;
}

const formatXLSXToJSON = (data: ArrayBuffer) => {
    const workbook = XLSX.read(data);
    console.log("XLSX workbook read successfully, sheets:", workbook.SheetNames);
    if (workbook.SheetNames.length === 0) {
        throw new Error("No sheets found in the XLSX file");
    }
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, {
        range: 3,
        defval: undefined,
    });
}

const getData = async ({ fetch }: { fetch: Fetch }) => {
    const xlsx = await fetchAlkoPriceList({ fetch });
    const json = formatXLSXToJSON(xlsx);
    console.log("Formatted JSON data, total items:", json.length);
    return json
}

export const load: PageLoad = async ({ fetch }) => {
    const data = await getData({ fetch });
    console.log("Data loaded, total items:", data.length);
	return { data };
};