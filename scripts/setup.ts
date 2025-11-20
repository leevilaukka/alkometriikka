import XLSX from "xlsx"

const DATASET_URL = "https://www.alko.fi/INTERSHOP/static/WFS/Alko-OnlineShop-Site/-/Alko-OnlineShop/fi_FI/Alkon%20Hinnasto%20Tekstitiedostona/alkon-hinnasto-tekstitiedostona.xlsx"
const DEV = process.argv.includes("--dev");

async function fetchAlkoPriceList() {
    const req = await fetch(DATASET_URL);
    if (!req.ok) {
        throw new Error(`Hinnaston lataaminen epäonnistui: ${req.status} ${req.statusText}`);
    }
    const arrayBuffer = await req.arrayBuffer();
    return arrayBuffer;
}

/**
 * Formats the XLSX file data into a JSON object.
 * @param data ArrayBuffer with XLSX file data
 * @returns Object with AOA table and file metadata
 */
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

/**
 * Compresses the dataset and saves it to a file.
 * @param data Table data and metadata from formatXLSXToJSON
 * @returns void 
 */
function saveDataset(data: { table: any[], metadata: XLSX.FullProperties }) {
    const json = JSON.stringify(data);
    Bun.write(DEV ? "./static/data.json" : "./data.json", json);
}

async function purgeCache() {
    const purgeKey = process.env.CLOUDFLARE_PURGE_KEY;

    if (!purgeKey) {
        console.warn("CLOUDFLARE_PURGE_KEY is not set. Skipping cache purge.");
        return;
    }
    console.log("Purging Cloudflare cache...");

    await fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE}/purge_cache`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${purgeKey}`
        },
        body: JSON.stringify({
            files: ["https://alkometriikka.fi/data.json"]
        })
    }).then(async res => {
        if (!res.ok) {
            throw new Error(`Cache purge failed: ${res.status} ${res.statusText}`);
        }
        console.log("Cache purge successful.", await res.json());
    }).catch(err => {
        console.error("Error during cache purge:", err);
    });
}

async function setup() {
    console.log("Fetching Alko price list...");
    const xlsx = await fetchAlkoPriceList();
    const json = formatXLSXToJSON(xlsx);
    await purgeCache();
    saveDataset(json);
}

setup().catch(err => {
    console.error("Error during setup:", err);
    process.exit(1);
});
