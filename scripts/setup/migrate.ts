
/**
 * Goal: Convert the legacy XLSX-based data.json to a new format based on Alko's API responses as outlinde in /notes/notes.md
 * 
 * Steps:
 * 1. Fetch the legacy data.json (from the last commit before migration)
 * 
 * 2. Convert the legacy data to the new format by:
 *    - Mapping the legacy headers to the new API response fields (using LEGACY_HEADERS and the notes/notes.md mapping and fieldToArrayValueInOrder mapping)
 *  
 * 3. Save the new data.json to disk (or print it to console for now)
 * 
 * Note: This is a one-time migration script, so it doesn't need to be perfect or handle all edge cases. The goal is to get a working version of the new data.json that can be used in the app, and then we can manually review and fix any issues.
 */



import {FIELD_TO_LEGACY_SCHEMA, LEGACY_HEADERS, getHash, getHashValues} from "./constants.ts";
import type {MigratedData, MigratedProduct} from "./types.ts";

const LEGACY_JSON_URL = "https://raw.githubusercontent.com/leevilaukka/alkometriikka/dfbaa4c24221a1844388fcc53d361add4019b6c2/data.json";
/** When running with `--dev` we write to the local static folder. Mirrors setup/index.ts. */
const DEV = process.argv.includes("--dev");
/** Where the migrated dataset is written. Mirrors the setup/index.ts convention. */
const OUTPUT_JSON_PATH = DEV ? "./static/data.json" : "./data.json";

/** Column indices of hashed fields whose stored legacy format differs from the sync-produced format. */
const HINTA_INDEX = LEGACY_HEADERS.indexOf("Hinta");
const ALKOHOLI_INDEX = LEGACY_HEADERS.indexOf("Alkoholi-%");
const LUONNEHDINTA_INDEX = LEGACY_HEADERS.indexOf("Luonnehdinta");

type LegacyPricePoint = {
    date: string;
    price: number | string;
};

type LegacyData = {
    table?: unknown[][];
};

function toNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const normalized = Number(value.replace(",", ".").trim());
        if (Number.isFinite(normalized)) {
            return normalized;
        }
    }
    return null;
}

function normalizeHistory(history: unknown, fallbackPrice: unknown): { date: string; price: number }[] {
    if (Array.isArray(history)) {
        const parsed = history
            .map((entry) => {
                const point = entry as LegacyPricePoint;
                const price = toNumber(point?.price);
                if (!point?.date || price === null) {
                    return null;
                }
                return { date: String(point.date), price };
            })
            .filter((entry): entry is { date: string; price: number } => entry !== null);

        if (parsed.length > 0) {
            return parsed;
        }
    }

    const fallback = toNumber(fallbackPrice);
    if (fallback === null) {
        return [];
    }

    return [{
        date: new Date().toISOString().slice(0, 10),
        price: fallback
    }];
}

async function loadLegacyData(url: string): Promise<LegacyData> {
    const req = await fetch(url, { cache: "no-store" });
    if (!req.ok) {
        throw new Error(`Legacy data.json lataaminen epäonnistui: ${req.status} ${req.statusText}`);
    }
    return await req.json() as LegacyData;
}

/**
 * Normalizes the raw legacy values into the same shape the live sync produces
 * via `buildLegacyValues`, so the migration hash lands in the same domain as
 * the sync hash. Without this the hashed fields differ by type (price/abv are
 * stored as strings vs numbers, taste as a comma-string vs an array), so every
 * product would look "changed" on the first sync and force a full detail
 * re-fetch. Non-hashed columns are left untouched.
 */
function normalizeHashValues(values: unknown[]): unknown[] {
    const normalized = [...values];
    normalized[HINTA_INDEX] = toNumber(values[HINTA_INDEX]);
    normalized[ALKOHOLI_INDEX] = toNumber(values[ALKOHOLI_INDEX]);
    const taste = values[LUONNEHDINTA_INDEX];
    normalized[LUONNEHDINTA_INDEX] = typeof taste === "string" ? taste.split(",") : taste;
    return normalized;
}

function migrateLegacyTable(legacy: LegacyData): MigratedData {
    if (!Array.isArray(legacy.table) || legacy.table.length === 0) {
        throw new Error("Legacy data.json sisältää virheellisen tai tyhjän table-kentän.");
    }

    const [sourceHeaders, ...rows] = legacy.table;
    if (!Array.isArray(sourceHeaders)) {
        throw new Error("Legacy data.json header-rivi puuttuu tai on virheellinen.");
    }

    const headerIndex = new Map<string, number>();
    sourceHeaders.forEach((header, index) => {
        if (typeof header === "string") {
            headerIndex.set(header, index);
        }
    });

    const historyIndex = headerIndex.get("Hintahistoria");
    const now = new Date().toISOString();
    const out: MigratedData = {
        schema: LEGACY_HEADERS,
        metadata: {
            LastUpdated: now,
            LastSynced: now
        },
        products: {}
    };

    for (const row of rows) {
        if (!Array.isArray(row)) {
            continue;
        }

        const values = FIELD_TO_LEGACY_SCHEMA.map(({legacyKey}) => {
            const index = headerIndex.get(legacyKey);
            if (index === undefined) {
                return null;
            }
            return row[index] ?? null;
        });

        const id = String(values[0] ?? "").trim();
        if (id.length === 0) {
            continue;
        }

        const rowHistory = historyIndex !== undefined ? row[historyIndex] : undefined;
        const priceHistory = normalizeHistory(rowHistory, values[4]);

        out.products![id] = {
            hash: getHash(getHashValues(normalizeHashValues(values))),
            values,
            priceHistory
        };
    }

    return out;
}

async function migrateData() {
    const legacyData = await loadLegacyData(LEGACY_JSON_URL);
    const migrated = migrateLegacyTable(legacyData);

    await Bun.write(OUTPUT_JSON_PATH, JSON.stringify(migrated));

    const productCount = Object.keys(migrated.products ?? {}).length;
    console.log(`Migration valmis: ${productCount} tuotetta kirjoitettu tiedostoon ${OUTPUT_JSON_PATH}`);
}

migrateData().catch(err => {
    console.error("Error during migration:", err);
});