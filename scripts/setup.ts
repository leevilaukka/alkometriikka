import { compress, compressToUTF16 } from "lz-string"
import XLSX from "xlsx"

const DATASET_URL = "https://www.alko.fi/INTERSHOP/static/WFS/Alko-OnlineShop-Site/-/Alko-OnlineShop/fi_FI/Alkon%20Hinnasto%20Tekstitiedostona/alkon-hinnasto-tekstitiedostona.xlsx"

function corsProxy(url: string) {
    return "https://corsproxy.io/?url=" + url
}

async function fetchAlkoPriceList() {
    const req = await fetch(DATASET_URL);
    if (!req.ok) {
        throw new Error(`Hinnaston lataaminen epäonnistui: ${req.status} ${req.statusText}`);
    }
    const arrayBuffer = await req.arrayBuffer();
    return arrayBuffer;
}

function formatXLSXToJSON(data: ArrayBuffer) {
    const workbook = XLSX.read(data);
    const sheetName = workbook.SheetNames[0];
    const metadata = workbook.Props;
    const sheet = workbook.Sheets[sheetName];
    if (sheet === undefined || !metadata) {
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

    return {
        table: dataset,
        metadata
    }
}

function saveDataset(data: { table: any[], metadata: XLSX.FullProperties }) {
    const json = JSON.stringify(data);
    const compressed = compressToUTF16(json);
    Bun.write("./data.txt", compressed);
}

async function setup() {
    console.log("Fetching Alko price list...");
    const xlsx = await fetchAlkoPriceList();
    const json = formatXLSXToJSON(xlsx);
    saveDataset(json);
}

setup().catch(err => {
    console.error("Error during setup:", err);
    process.exit(1);
});
