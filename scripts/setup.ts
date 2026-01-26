import XLSX from "xlsx"

const DATASET_URL = "https://www.alko.fi/INTERSHOP/static/WFS/Alko-OnlineShop-Site/-/Alko-OnlineShop/fi_FI/Alkon%20Hinnasto%20Tekstitiedostona/alkon-hinnasto-tekstitiedostona.xlsx"
const DATA_JSON_URL = "https://raw.githubusercontent.com/leevilaukka/alkometriikka/refs/heads/gh-pages/data.json"
const DEV = process.argv.includes("--dev");

async function fetchAlkoPriceList() {
    const req = await fetch(DATASET_URL, { cache: "no-store" });
    if (!req.ok) {
        throw new Error(`Hinnaston lataaminen epäonnistui: ${req.status} ${req.statusText}`);
    }
    const arrayBuffer = await req.arrayBuffer();
    return arrayBuffer;
}

/**
 * Fetches the existing data.json from production to merge price history.
 * @returns Object with existing data or null if not found
 */
async function fetchExistingData() {
    try {
        const req = await fetch(DATA_JSON_URL, { cache: "no-store" });
        if (!req.ok) {
            console.warn(`Could not fetch existing data.json: ${req.status} ${req.statusText}`);
            return null;
        }
        const data = await req.json();
        return data;
    } catch (err) {
        console.warn("Error fetching existing data.json:", err);
        return null;
    }
}

/**
 * Formats the XLSX file data into a JSON object.
 * @param data ArrayBuffer with XLSX file data
 * @param existingData Existing data.json to merge price history from
 * @returns Object with AOA table (with price history merged) and file metadata
 */
function formatXLSXToJSON(data: ArrayBuffer, existingData: any) {
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

    // Get existing price history (from previous data.json table rows)
    const existingPriceHistory = extractPriceHistory(existingData?.table || []);
    
    // Merge price history directly into table rows
    const tableWithHistory = mergePriceHistoryIntoTable(dataset, existingPriceHistory);

    return {
        table: tableWithHistory,
        metadata
    }
}

/**
 * Extracts price history from existing table data.
 * @param existingTable Existing table data with price history
 * @returns Map of product IDs to their price history
 */
function extractPriceHistory(existingTable: any[]) {
    const priceHistoryMap: Record<string, { date: string; price: number }[]> = {};
    
    for (const row of existingTable) {
        const productId = row[0];
        const priceHistory = row[row.length - 1]; // Assuming price history is the last column
        
        if (productId && Array.isArray(priceHistory)) {
            priceHistoryMap[productId] = priceHistory;
        }
    }
    
    return priceHistoryMap;
}

/**
 * Merges price history directly into table rows.
 * @param newTable New table data from XLSX
 * @param existingHistory Existing price history extracted from previous data
 * @returns Table with price history as the last column in each row
 */
function mergePriceHistoryIntoTable(newTable: any[], existingHistory: Record<string, { date: string; price: number }[]>) {
    const today = new Date().toISOString().split('T')[0];

    return newTable.map((row, index) => {
        // First row is the header row
        if (index === 0) {
            return [...row, "Hintahistoria"];
        }

        const productId = row[0]; // Assuming first column is product ID
        const price = row[4]; // Assuming fifth column is price

        if (!productId || price === undefined) {
            return [...row, []];
        }

        // Get existing history or initialize empty array
        const history = existingHistory[productId] ? [...existingHistory[productId]] : [];
        const lastEntry = history[history.length - 1];

        // Only add new entry if price changed or no history exists
        if (!lastEntry || lastEntry.price !== price) {
            history.push({ date: today, price });
        }

        // Append price history as the last column
        return [...row, history];
    });
}

/**
 * Compresses the dataset and saves it to a file.
 * @param data Table data (with price history) and metadata from formatXLSXToJSON
 * @returns void 
 */
function saveDataset(data: { table: any[], metadata: XLSX.FullProperties }) {
    const json = JSON.stringify(data);
    Bun.write(DEV ? "./static/data.json" : "./data.json", json);
}

async function purgeCache() {
    if(DEV) return;
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
    console.log("Fetching existing data.json...");
    const existingData = await fetchExistingData();
    
    console.log("Fetching Alko price list...");
    const xlsx = await fetchAlkoPriceList();
    const json = formatXLSXToJSON(xlsx, existingData);
    
    console.log(`Processed ${json.table.length} products with price history`);
    
    await purgeCache();
    saveDataset(json);
    
    console.log("Setup complete!");
}

setup().catch(err => {
    console.error("Error during setup:", err);
    process.exit(1);
});
