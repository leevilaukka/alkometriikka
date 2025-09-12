import type { PageLoad } from './$types';
import * as XLSX from 'xlsx';

const URL = "https://corsproxy.io/?url=https://www.alko.fi/INTERSHOP/static/WFS/Alko-OnlineShop-Site/-/Alko-OnlineShop/fi_FI/Alkon%20Hinnasto%20Tekstitiedostona/alkon-hinnasto-tekstitiedostona.xlsx";

const fetchAlkoPriceList = async () => {
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

const getData = async () => {
    const xlsx = await fetchAlkoPriceList();
    const json = formatXLSXToJSON(xlsx);
    console.log("Formatted JSON data, total items:", json.length);
    return json
}

export const load: PageLoad = async () => {
    const data = await getData();
    console.log("Data loaded, total items:", data.length);
	return { data };
};