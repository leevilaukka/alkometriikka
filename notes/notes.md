
### migration
1. load products
2. create old format arrays from loaded products using toProductRow
3. calculate hashes for loaded
4. load existing products
5. convert existing products to new arrays + calculate (use existing hashes?) hashes for existing
6. compare existing with loaded
7. load complete data for products where hash doesnt match or product doesnt exist
8. recalculate new product hashes and save to file

### new data sync
1. load products
2. create old format arrays from loaded products using toProductRow
3. calculate hashes for loaded
4. load existing products
5. calculate (use existing hashes?) hashes for existing
6. compare existing with loaded
7. load complete data for products where hash doesnt match or product doesnt exist
8. recalculate new product hashes and save to file

```ts
async function loadProducts(skip = 0, top = 1000) {
    const out = []
    
    const productsRepsonse = await fetch("https://www.alko.fi/api/search/product", { method: "POST", body: JSON.stringify({"top": top}), headers: {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0"} })
    const productsJSON = productsResponse.json()

    const last = productsJSON.value.length < top;

    if(!last) out.push(...loadProducts(skip + top))

    return out
}    
```

2.
```ts
async function compareExisting(all, existing) {
    
}
```

```ts
async function toProductRow(obj: FullProductData) {
    const out = []
    fieldToArrayOrder.forEach(([property, preprocessor], index) => {
        out[index] = preprocessor(obj[property])
    })
    return out
}
```
{
    newPropertyKey: string
    legacyKey: string
    usedForHashing: boolean
    preprocessor: () => any
}

> Huom. Tämä suunniteltu niin, että lisätieto-APIn vastaavat keyt ylikirjoittavat hakuapista tulevat (esim hakuapin mainGroupName = \["väkevät"\], kun lisätieto-APIssa mainGroupName = "väkevät"). Tiedot kuten hinta, alkoholipitoisuus on kuitenkin pyritty ottaa haku-apin tarjoamista tiedoista.
```ts
const findRegionFromSites = (sites) => {
    const region = sites.find(site => site.searchParams?.regionId !== undefined)
    return region.label ? `${region.label} - ${region.value}` : region.value
} 

const fieldToArrayValueInOrder: [string, (value: keyof typeof FullProductData) => unknown] = [
    ["id", (value) => value] /*Haku-APIsta*/,
    ["name", (value) => value] /*Haku-APIsta*/,
    ["producer", (value) => value],
    ["volume", (value) => value] /*Haku-APIsta*/,
    ["price", (value) => value] /*Haku-APIsta*/,
    ["pricePerLitre", (value) => Number(value)],
    ["tags", (tags) => tags.some(tag => tag.variant === "new") ? "uutuus" : null], /*Uutuus*/
    ["id", (value) => null], /*Hinnastojärjestyskoodi (ei tarvetta?)*/
    ["mainGroup", (value) => value],
    ["category", (value) => value],
    ["certificateId", (value) => value.includes("certificate_005")], /*Erityisryhmä (tbd) (vegaani)*/
    ["flavorTag", (value) => value.text],
    ["countryName", (value) => value] /*Maa, Haku-APIsta*/,
    ["productionSites", findRegionFromSites] /*Alue*/,
    ["vintage", (value) => value],
    ["id", (value) => null], /*Etikettimerkintöjä (tbd)*/
    ["moreInfo", (value) => value], /* Huomautus */
    ["grapeVarieties", (grapes) => grapes.map(grape => grape.label).join(", ")],
    ["taste", (value) => value.split(",")] /*Haku-APIsta*/,
    ["packageTypes", (value) => value.split("|")[2]], /*Haku-APIsta*/
    ["closures", (value) => value.split("|")[2]] /*Haku-APIsta*/,
    ["abv", (value) => value] /*Haku-APIsta*/,
    ["acidPerLitre", (value) => value],
    ["sugarPerLitre", (value) => value],
    ["beerWortPlato", (value) => value],
    ["id", (value) => null], /*Väri (ei löydy?)*/
    ["beerBitternessEbu", (value) => value],
    ["nutrition", (value) => value.kiloCaloriesPerDL],
    ["selectionTypes", (value) => value.split("|")[2]] /*Haku-APIsta*/,
    ["id", (value) => null] /* EAN (ei enää olemassa; RIP viivakoodinlukija :( ) */
]
```

```ts
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
```

```ts
interface Products {
    schema: [
        { name: string ... }
    ],
    [key: string /* id */ ]: {
        hash: string // hash from initial load as JSON.stringify([id, hinta, ...])
        values: any[] // full item data
        priceHistory: number[]
    }[]
}
```

