export interface SearchApiResponse {
    "@odata.count": number;
    "@search.facets": unknown;
    value?: SearchProductData[];
}

export type FullProductData = Omit<SearchProductData, "country"> & DetailedProductData;

export interface ProductDetailsApiResponse {
  data?: DetailedProductData;
}

/** A single dated price observation kept in a product's price history. */
export type PricePoint = { date: string; price: number };

/**
 * Extra, non-schema metadata attached to a product. Products are never deleted
 * from the dataset; instead lifecycle flags are recorded here.
 */
export type ProductMeta = {
  /** ISO date (YYYY-MM-DD) when the product was first detected as no longer in Alko's selection. */
  removedFromSelection?: string;
};

/** A migrated/synced product: change-detection hash, legacy-ordered values, price history and optional metadata. */
export type MigratedProduct = {
  hash: string;
  values: unknown[];
  priceHistory: PricePoint[];
  meta?: ProductMeta;
};

/** The on-disk dataset shape: a `schema` header row plus one entry per product id. */
export type MigratedData = {
  schema: readonly string[];
  metadata: {
    LastUpdated: string;
    LastSynced: string;
  }
  products?: Record<string, MigratedProduct>;
}

export type FieldToArrayOrder<T extends FullProductData> = [keyof T, (value: T[keyof T]) => unknown][];
/**
 * SearchAPIResponse URL: POST https://www.alko.fi/api/search/product (body: { top: 1000, skip: 0 })
 */
export interface SearchProductData {
  id: string;
  abv: number;
  taste: string;
  additionalInfo: string;
  productCommunicationEthical: string | null;
  productCommunicationProduction: string | null;
  productCommunicationCultivation: string | null;
  closures: string[];
  closureId: string[];
  country: string;
  countryName: string;
  foodSymbolId: string[];
  grapes: string[];
  mainGroups: string[];
  mainGroupId: string[];
  mainGroupName: string[];
  name: string;
  price: number;
  packageSizes: string[];
  packageSizeId: string[];
  packageTypes: string[];
  productGroupId: string[];
  productGroupName: string[];
  selectionTypes: string[];
  selectionTypeId: string[];
  tasteStyles: string[];
  tasteStyleId: string[];
  tasteStyleName: string[];
  volume: number;
  storeId: string[];
  onlineAvailabilityDatetimeTs: number;
  onlineAvailability: boolean;
  statusId: string;
  webshopStock: number;
  limeStock: number | null;
  limeWebshopTotalStock: number;
};


/**
 * ProductDetailsApiResponse URL: GET https://www.alko.fi/api/product-api/products/{productId}
 */
export interface DetailedProductData {
  acidPerLitre: number;
  additionalInfo: string;
  adjectives: string[];
  alcoholPercentage: number;
  beerWortPlato: number | null;
  beerBitternessEbu: number | null;
  productGroupId: string;
  category: string;
  mainGroup: string;
  mainGroupId: string;
  mainGroupName: string;
  certificates: Certificates;
  characteristics: unknown[];
  classifications: Classification[];
  communicationCertificates: unknown[];
  containerOptions: unknown[];
  containerSizeLitres: number;
  containerType: string;
  country: Country;
  flavorTag: FlavorTag;
  grapeVarieties: GrapeVariety[];
  imageUrl: string;
  fallbackImageUrl: string;
  ingredients: string | null;
  isFavorite: boolean;
  name: string;
  pricePerLitre: string;
  producer: string;
  productionSites: ProductionSite[];
  productId: string;
  scales: Scale[];
  slides: Slide[];
  supplier: string;
  tags: Tag[];
  valueInCents: number;
  energyPerLitre: number;
  sugarPerLitre: number;
  closureName: string;
  selectionTypeName: string;
  onlineAvailabilityDatetime: string;
  onlineAvailability: boolean;
  vintage: string;
  materials: unknown[];
  nutrition: Nutrition;
  weight: number;
  emptyWeight: number;
  packageCertificates: unknown[];
  ingredientsList: string | null;
}

export interface Certificates {
  cultivation: boolean;
  production: boolean;
  ethical: boolean;
  organic: boolean;
}

export interface Classification {
  type: string;
  searchParams: {
    foodSymbolId: string;
  };
  symbolId: string;
}

export interface Country {
  name: string;
  id: string;
}

export interface FlavorTag {
  text: string;
  id: string;
  accentColor: string;
  searchParams: {
    tasteStyleId: string;
  };
}

export interface GrapeVariety {
  label: string;
  searchParams: {
    grapeId: string;
  };
}

export interface ProductionSite {
  label: string;
  searchParams: {
    countryId?: string;
    regionId?: string | null;
  };
  value?: string;
}

export interface Scale {
  title: string;
  value: number;
  label: string;
  numOfItems: number;
}

export interface Slide {
  imageUrl: string;
  fallbackImageUrl: string;
  description: string;
  largerImageUrl: string;
}

export interface Tag {
  size: string;
  searchParams: {
    statusId: string;
  };
  variant: string;
  children: string;
}

export interface Nutrition {
  kiloJoulesPerDL: number;
  kiloCaloriesPerDL: number;
}


