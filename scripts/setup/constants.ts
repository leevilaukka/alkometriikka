import { CryptoHasher } from "bun";

export const LEGACY_HEADERS = [
  "Numero",
  "Nimi",
  "Valmistaja",
  "Pullokoko",
  "Hinta",
  "Litrahinta",
  "Uutuus",
  "Hinnastojärjestyskoodi",
  "Tyyppi",
  "Alatyyppi",
  "Erityisryhmä",
  "Oluttyyppi",
  "Valmistusmaa",
  "Alue",
  "Vuosikerta",
  "Etikettimerkintöjä",
  "Huomautus",
  "Rypäleet",
  "Luonnehdinta",
  "Pakkaustyyppi",
  "Suljentatyyppi",
  "Alkoholi-%",
  "Hapot g/l",
  "Sokeri g/l",
  "Kantavierrep-%",
  "Väri EBC",
  "Katkerot EBU",
  "Energia kcal/100 ml",
  "Valikoima",
  "EAN"
] as const;

/**
 * Main groups that are not actual drinks (gifts & drinking accessories) and
 * should never end up in the dataset.
 */
export const IRRELEVANT_MAIN_GROUP_IDS: ReadonlySet<string> = new Set(["mainGroup_002"]);
export const IRRELEVANT_MAIN_GROUP_NAMES: ReadonlySet<string> = new Set(["lahja- ja juomatarvikkeet"]);

/** Column index of the main-group name ("Tyyppi") inside a legacy `values` array. */
const TYYPPI_INDEX = LEGACY_HEADERS.indexOf("Tyyppi");

/** Normalizes an unknown field into a list of trimmed strings. */
function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

/**
 * True when a raw search/detail product belongs to an irrelevant main group,
 * matched either by `mainGroupId` or `mainGroupName`.
 */
export function isIrrelevantMainGroup(source: { mainGroupId?: unknown; mainGroupName?: unknown }): boolean {
  const ids = toStringList(source.mainGroupId);
  const names = toStringList(source.mainGroupName);
  return (
    ids.some((id) => IRRELEVANT_MAIN_GROUP_IDS.has(id.trim())) ||
    names.some((name) => IRRELEVANT_MAIN_GROUP_NAMES.has(name.trim().toLowerCase()))
  );
}

/**
 * True when a stored legacy `values` array belongs to an irrelevant main group,
 * matched by its "Tyyppi" column.
 */
export function isIrrelevantStoredValues(values: unknown[]): boolean {
  const tyyppi = values[TYYPPI_INDEX];
  return typeof tyyppi === "string" && IRRELEVANT_MAIN_GROUP_NAMES.has(tyyppi.trim().toLowerCase());
}

export type ProductFieldMapping = {
  newPropertyKey: string;
  legacyKey: (typeof LEGACY_HEADERS)[number];
  usedForHashing: boolean;
  preprocessor: (value: unknown) => unknown;
};

const findRegionFromSites = (sites: unknown) => {
  if (!Array.isArray(sites)) {
    return null;
  }

  const region = sites.find((site) => {
    if (!site || typeof site !== "object") {
      return false;
    }

    const searchParams = (site as { searchParams?: { regionId?: unknown } }).searchParams;
    return searchParams?.regionId !== undefined && searchParams?.regionId !== null;
  }) as { label?: unknown; value?: unknown } | undefined;

  if (!region) {
    return null;
  }

  const label = typeof region.label === "string" ? region.label : null;
  const value = typeof region.value === "string" ? region.value : null;

  if (label && value) {
    return `${label} - ${value}`;
  }

  return value;
};

export const FIELD_TO_LEGACY_SCHEMA: ProductFieldMapping[] = [
  { newPropertyKey: "id", legacyKey: "Numero", usedForHashing: false, preprocessor: (value) => value },
  { newPropertyKey: "name", legacyKey: "Nimi", usedForHashing: true, preprocessor: (value) => value },
  { newPropertyKey: "producer", legacyKey: "Valmistaja", usedForHashing: false, preprocessor: (value) => value },
  { newPropertyKey: "volume", legacyKey: "Pullokoko", usedForHashing: false, preprocessor: (value) => value },
  { newPropertyKey: "price", legacyKey: "Hinta", usedForHashing: true, preprocessor: (value) => value },
  { newPropertyKey: "pricePerLitre", legacyKey: "Litrahinta", usedForHashing: false, preprocessor: (value) => Number(value) },
  {
    newPropertyKey: "tags",
    legacyKey: "Uutuus",
    usedForHashing: false,
    preprocessor: (tags) => Array.isArray(tags) && tags.some((tag) => tag && typeof tag === "object" && (tag as { variant?: unknown }).variant === "new") ? "uutuus" : null
  },
  { newPropertyKey: "id", legacyKey: "Hinnastojärjestyskoodi", usedForHashing: false, preprocessor: () => null },
  { newPropertyKey: "mainGroup", legacyKey: "Tyyppi", usedForHashing: false, preprocessor: (value) => value },
  { newPropertyKey: "category", legacyKey: "Alatyyppi", usedForHashing: false, preprocessor: (value) => value },
  {
    newPropertyKey: "certificateId",
    legacyKey: "Erityisryhmä",
    usedForHashing: false,
    preprocessor: (value) => Array.isArray(value) ? value.includes("certificate_005") : false
  },
  {
    newPropertyKey: "flavorTag",
    legacyKey: "Oluttyyppi",
    usedForHashing: false,
    preprocessor: (value) => value && typeof value === "object" ? (value as { text?: unknown }).text : null
  },
  { newPropertyKey: "countryName", legacyKey: "Valmistusmaa", usedForHashing: false, preprocessor: (value) => value },
  {
    newPropertyKey: "productionSites",
    legacyKey: "Alue",
    usedForHashing: false,
    preprocessor: findRegionFromSites
  },
  { newPropertyKey: "vintage", legacyKey: "Vuosikerta", usedForHashing: false, preprocessor: (value) => value },
  { newPropertyKey: "id", legacyKey: "Etikettimerkintöjä", usedForHashing: false, preprocessor: () => null },
  { newPropertyKey: "moreInfo", legacyKey: "Huomautus", usedForHashing: false, preprocessor: (value) => value },
  {
    newPropertyKey: "grapeVarieties",
    legacyKey: "Rypäleet",
    usedForHashing: false,
    preprocessor: (grapes) => Array.isArray(grapes) ? grapes.map((grape) => grape && typeof grape === "object" ? (grape as { label?: unknown }).label : "").join(", ") : null
  },
  {
    newPropertyKey: "taste",
    legacyKey: "Luonnehdinta",
    usedForHashing: true,
    preprocessor: (value) => typeof value === "string" ? value.split(",") : value
  },
  {
    newPropertyKey: "packageTypes",
    legacyKey: "Pakkaustyyppi",
    usedForHashing: false,
    preprocessor: (value) => Array.isArray(value) ? value.join("|").split("|")[2] ?? null : typeof value === "string" ? value.split("|")[2] ?? null : null
  },
  {
    newPropertyKey: "closures",
    legacyKey: "Suljentatyyppi",
    usedForHashing: false,
    preprocessor: (value) => Array.isArray(value) ? value.join("|").split("|")[2] ?? null : typeof value === "string" ? value.split("|")[2] ?? null : null
  },
  { newPropertyKey: "abv", legacyKey: "Alkoholi-%", usedForHashing: true, preprocessor: (value) => value },
  { newPropertyKey: "acidPerLitre", legacyKey: "Hapot g/l", usedForHashing: false, preprocessor: (value) => value },
  { newPropertyKey: "sugarPerLitre", legacyKey: "Sokeri g/l", usedForHashing: false, preprocessor: (value) => value },
  { newPropertyKey: "beerWortPlato", legacyKey: "Kantavierrep-%", usedForHashing: false, preprocessor: (value) => value },
  { newPropertyKey: "id", legacyKey: "Väri EBC", usedForHashing: false, preprocessor: () => null },
  { newPropertyKey: "beerBitternessEbu", legacyKey: "Katkerot EBU", usedForHashing: false, preprocessor: (value) => value },
  {
    newPropertyKey: "nutrition",
    legacyKey: "Energia kcal/100 ml",
    usedForHashing: false,
    preprocessor: (value) => value && typeof value === "object" ? (value as { kiloCaloriesPerDL?: unknown }).kiloCaloriesPerDL : null
  },
  {
    newPropertyKey: "selectionTypes",
    legacyKey: "Valikoima",
    usedForHashing: true,
    preprocessor: (value) => Array.isArray(value) ? value.join("|").split("|")[2] ?? null : typeof value === "string" ? value.split("|")[2] ?? null : null
  },
  { newPropertyKey: "id", legacyKey: "EAN", usedForHashing: false, preprocessor: () => null }
];

/**
 * Builds a legacy-ordered value array from an API product object by running each
 * schema entry's `preprocessor` over the matching `newPropertyKey`.
 *
 * The resulting array is aligned to {@link LEGACY_HEADERS} order and is the
 * canonical `values` payload stored on disk for every product.
 */
export function buildLegacyValues(source: Record<string, unknown>): unknown[] {
  return FIELD_TO_LEGACY_SCHEMA.map((field) => field.preprocessor(source[field.newPropertyKey]) ?? null);
}

/**
 * Extracts only the change-detection relevant values (`usedForHashing`) from a
 * legacy-ordered value array, preserving their column order.
 */
export function getHashValues(values: unknown[]): unknown[] {
  return FIELD_TO_LEGACY_SCHEMA
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => field.usedForHashing)
    .map(({ index }) => values[index]);
}

/**
 * Produces an order-independent representation of a hashed value. Array-valued
 * fields (e.g. `taste`/Luonnehdinta) are trimmed and sorted so that the same
 * set of entries in a different source order hashes identically, preventing
 * spurious "changed" detections that trigger unnecessary detail re-fetches.
 */
function canonicalizeHashValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : item))
      .sort();
  }
  return value;
}

/** Computes a stable SHA-256 hex hash over the given values. */
export function getHash(values: unknown[]): string {
  const hasher = new CryptoHasher("sha256");
  hasher.update(JSON.stringify(values.map(canonicalizeHashValue)));
  return hasher.digest("hex");
}

