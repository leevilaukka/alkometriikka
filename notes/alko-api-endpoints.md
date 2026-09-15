# Alko API – endpoint walkthrough

> Compiled 2026-09-14 by reverse-engineering:
> - alko.fi's own Next.js SPA bundles (`_next/static/chunks/*.js`, mainly `8175-f677ecb5a418ca88.js` which contains the whole API client module)
> - direct HTTP probes with curl
>
> All URLs are relative to **base URL `https://www.alko.fi`** unless noted. Every request needs:
>
> ```
> User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:147.0) Gecko/20100101 Firefox/147.0
> Accept: application/json
> Content-Type: application/json   (POST/PUT/PATCH)
> ```
>
> This already exists in the codebase as `REQUEST_HEADERS` (scripts/setup/constants.ts).

---

## 1. API services at a glance

The SPA client module (`8175-f677ecb5a418ca88.js`) wires up the services like this:

| Service           | Base path                 | SPA class |
|-------------------|---------------------------|-----------|
| searchApi         | `/api/search`             | `A`       |
| contentApi        | `/api/content`            | `U`       |
| contentSearchApi  | `/api/content-search`     | `P`       |
| productApi        | `/api/product-api`        | `k`       |
| storesApi         | `/api/stores`             | `W`       |
| intershopApi      | `/api/intershop`          | `v`       |
| deliveryPricingApi| `/api/delivery-pricing`   | `o`       |
| cmdApi            | `/api/cmd`                | `s`       |
| localisationApi   | `/api/localisation`       | `w`       |
| userApi           | `/api/user`               | `j`       |
| (auth)            | `/api/auth/*`             | NextAuth  |

---

## 2. Search API – `/api/search`

### `POST /api/search/product?lang=<locale>` – product search (used by sync)
- Body: `{ top: 1000, skip: 0, seed?: 1337 }`
- Response: `{ "@odata.count": 11209, "@search.facets": {...}, value: [SearchProductData, ...] }`
- `seed` – a fixed `seed` makes paging deterministic (without it the API returns only ~7000–7700 *distinct* products and pads the rest with duplicates despite advertising the full `@odata.count`). Already documented in the `scripts/setup/index.ts` comments.
- Per-product response fields (verified via live call):
  ```json
  {
    "id": "480307", "abv": 13, "taste": "...", "additionalInfo": "",
    "productCommunicationEthical": null, "productCommunicationProduction": null, "productCommunicationCultivation": null,
    "closures": ["closureId|closure_Luonnonkorkki|luonnonkorkki"],
    "closureId": ["closure_Luonnonkorkki"],
    "country": "countryId|FRA|Ranska|", "countryName": "Ranska",
    "foodSymbolId": ["foodSymbol_Lammas", ...],
    "grapes": ["grapeId|grape_pinot_noir|Pinot Noir"],
    "mainGroups": ["mainGroupId|mainGroup_003|viinit"],
    "mainGroupId": ["mainGroup_003"], "mainGroupName": ["viinit"],
    "name": "Joseph Drouhin Nuits-Saint-Georges 2022", "price": 79.89,
    "packageSizes": ["packageSizeId|packageSize_0x75|0,75 l"],
    "packageSizeId": ["packageSize_0x75"],
    "packageTypes": ["packageTypeId|packageType_pullo|lasipullo"],
    "productGroupId": ["productGroup_110", "productGroup_110"],
    "productGroupName": ["punaviinit", "punaviinit"],
    "selectionTypes": ["selectionTypeId|selectionType_001|vakiovalikoima"],
    "selectionTypeId": ["selectionType_001"],
    "tasteStyles": ["tasteStyleId|tasteStyle_001|marjaisa & raikas"],
    "tasteStyleId": ["tasteStyle_001"], "tasteStyleName": ["marjaisa & raikas"],
    "volume": 0.75,
    "storeId": ["5016", "2102", "2286"],
    "onlineAvailabilityDatetimeTs": 1497862800, "onlineAvailability": true,
    "statusId": "A",
    "campaign_start_date": null, "campaign_end_date": null, "lowest_30d_price": null,
    "webshopStock": 6, "limeStock": 40, "limeWebshopTotalStock": 46,
    "imageUrl": "https://images.alko.fi/...", "imageUrlSmall": "https://images.alko.fi/..."
  }
  ```
- **Notes:**
  - `storeId` is the **set of stores where the product is in stock** (= the whole availability matrix comes for free from this single sweep, no extra requests).
  - `webshopStock` / `limeStock` / `limeWebshopTotalStock` are **aggregated** online-shop/lime warehouse balances, **not per-store**.
  - `lowest_30d_price`, `campaign_start_date`, `campaign_end_date` only appear on products on campaign.
  - Body params `storeId`, `store`, `availability` have **no effect** (verified – response is identical).

### `POST /api/search/count?lang=` – result count for a search
### `POST /api/search/translation?lang=` – search term translations

---

## 3. Product API – `/api/product-api`

### `GET /api/product-api/products/{productId}` – full product details (used by sync)
- Response: `{ data: DetailedProductData }` – e.g. `producer`, `vintage`, `grapeVarieties`, `productionSites`, `nutrition`, `taste`, etc. Not present in the search API.
- Used by `fetchProductDetails` in `scripts/setup/index.ts`.

### `GET /api/product-api/products?id=<id>[&lang=<locale>]` – batch-ish helper
- The SPA's `getProductsByIds` uses `URLSearchParams.stringify({ id, lang })`.
- Verified: a single `id=480307` returns a **flat product object** (search-API shaped; no `data` wrapper, no `items` list).
- `id=480307%3A100001` (colon-joined) returned `{"items":[]}` → multiple ids don't work as a colon-joined `id` param; if multi-id works at all it's likely `id[]=...` style (URLSearchParams with an array). **No per-store amounts here either.**

---

## 4. Stores API – `/api/stores`

### `GET /api/stores[?search=<query>]` – all stores (used by sync)
- Response: `{ data: [StoreData], totalAmount: 359 }` (StoreData has `id`, an `outletType` flag; `outletType === "2"` = pickup point, which the sync filters out).
- StoreData fields include:
  ```json
  {
    "id": "2102", "name": "Helsinki keskusta Arkadia", "name_sv": "Helsingfors centrum Arkadia",
    "address": "Salomonkatu 1", "postalCode": "00100", "postOffice": "HELSINKI", "city": "Helsinki",
    "openDays": ["kiinni","10–21",...], "openHours": [{ "hours": "10–21", "date": "2026-09-13" }, ...],
    "latitude": ..., "longitude": ...
  }
  ```
- `?search=` narrows by name/city (the SPA's store search).

### `GET /api/stores/{storeId}` – single store (`findById`)

**No other store endpoints.** The SPA has no `/api/stores/{id}/products` – it doesn't exist (see section 8; requests hit the SPA catch-all handler).

---

## 5. Intershop API – `/api/intershop` (webshop/cart/ordering)

### Availability
- **`GET /api/intershop/availability/webshop/<sku1>:<sku2>:<sku3>...`** ← ⭐ key new find
  - Returns **online-warehouse** availability for **many products in one call** (colon-separated in the path). The SPA itself batches this way.
  - Response: `{ success, elements: [ { ... ALKO_ProductOnlineDataRO } ] }`, per element:
    ```json
    {
      "type": "ALKO_ProductOnlineDataRO",
      "buyable": true, "messageCode": "200", "productAvailability": "0",
      "maxOrderQuantity": 0, "inCart": false, "inWishlist": false, "inStore": true,
      "estimatedAvailabilityAmount": 6, "estimatedAvailabilityDate": "2026-09-14",
      "maxAmountLimeGreen": 46, "hasSupplierStock": true,
      "sku": "480307", "availabilityColor": "green"
    }
    ```
  - `estimatedAvailabilityAmount` ≈ webshop balance, `maxAmountLimeGreen` ≈ webshop + lime restock.
  - Query params `storeId`, `sku`, `productId` **don't change the response** (verified) – no store scoping.
  - **Usefulness for this project:** ~11,000 products / ~200–500 per URL length → ~30–60 requests for the whole catalogue's online balances.

### Cart (`/api/intershop/cart*`)
| Method | Endpoint | Notes |
|--------|----------|-------|
| POST   | `/api/intershop/cart/add` | `{ productId, quantity, lang }` |
| POST   | `/api/intershop/cart/add-gift-card` | `{ giftCard, lang }` |
| GET    | `/api/intershop/cart[?lang=]` | fetch cart |
| PUT    | `/api/intershop/cart/update` | item quantity |
| DELETE | `/api/intershop/cart/remove` | remove item |
| PUT    | `/api/intershop/cart/update/basket-details` | addresses/shipping/storeId/delivery date |
| PATCH  | `/api/intershop/cart/payment-method` | payment method |
| DELETE | `/api/intershop/cart/delete` | clear cart |
| OPTIONS| `/api/intershop/cart/options` | cart options |

### Gift card
- **`POST /api/intershop/gift-card/check-balance`** – balance check

### Orders
- **`GET /api/intershop/orders/{orderId}`** – order details
- **`POST /api/intershop/orders`** – initiate order

### Wishlists
- **`GET /api/intershop/wishlists`** – own lists
- **`GET /api/intershop/wishlists/shared-lists`**
- **`POST /api/intershop/wishlists`** – `{ wishlistName, shared }`
- **`POST /api/intershop/wishlists/{id}/products/{productId}`** – add list & product
- **`DELETE /api/intershop/wishlists/{id}/products/{productId}`** – remove list & product

- **`POST /api/intershop/wishlists/batch-add`** – `{ productId, wishlistIds }`
- **`DELETE /api/intershop/wishlists/batch-remove`** – `{ productId, wishlistIds }`
- **`POST /api/intershop/wishlists/batch-get`** – `{ wishlistIds }`
- **`GET /api/intershop/wishlists/{wishlistId}`** – items on a list

### Alcohol permits
- **`GET /api/intershop/alcohol-permits`** – user's permits

### Reviews
- **`POST /api/intershop/products/reviewbatch`** – `{ productIds }`
- **`POST /api/intershop/products/{productId}/reviews`** – `{ reviewInput }`

### Stock notifications
- **`POST /api/intershop/notifications/stock`** – create notification
- **`GET /api/intershop/notifications/stock?productId=<id>`** – notification status
- (overview strings in the bundle: `"/notifications/stock"` and `"/notifications/stock?productId="`)

---

## 6. Content / localisation / cmd / user / auth

### `/api/content`
- `GET /api/content/recipes/food-recipes?...&locale=&page=` – food recipes
- `GET /api/content/recipes/drink-recipes?...&locale=&page=` – drink recipes
- `GET /api/content/microcopies?locale=` – micro-copy texts (insights etc.)

### `/api/content-search`
- `POST /api/content-search` – content search (recipes/articles/stores)

### `/api/localisation`
- `GET /api/localisation?path=<path>&contentId=<id>` – locale mapping for a URL path

### `/api/cmd` (customer/company data, B2C/B2B)
- `GET /api/cmd/customers?select=alkoId,...` – logged-in user's data
- `PATCH /api/cmd/customers` – favorite stores (`{ stores }`)
- `POST /api/cmd/customers/recipes` – add favorite recipe
- `DELETE /api/cmd/customers/recipes/{recipeIdWithLocale}` – remove favorite recipe
- `PATCH /api/cmd/customers/info` – user info (logged in)
- `PATCH /api/cmd/guest` – user info (guest)
- `GET /api/cmd/company/{companyAlkoId}/addresses` – company addresses

### `/api/delivery-pricing`
- `POST /api/delivery-pricing` – `{ body }` delivery prices

### `/api/user`
- `POST /api/user/me/profile` – update profile

### `/api/auth/*` (NextAuth)
- `GET /api/auth/csrf`
- `GET /api/auth/session`
- `GET/POST /api/auth/signin?`, `/api/auth/signout?callbackUrl=`, `/api/auth/callback?from=`

---

## 7. Frontend routes (SPA route map, chunk `1518-0b490c6299c084f8.js`)

| Route key | fi | sv | en |
|-----------|----|----|----|
| root | `/` | `/` | `/` |
| SEARCH_RESULTS | `/hakutulokset` | `/sokresultat` | `/search-results` |
| SEARCH_RESULTS_BY_CATEGORY | `/hakutulokset/[category]` | `/sokresultat/[category]` | `/search-results/[category]` |
| STORES | `/myymalat-palvelut` | `/butiker-tjanster` | `/stores-services` |
| STORE_BY_ID | `/myymalat-palvelut/[storeId]` | `/butiker-tjanster/[storeId]` | `/stores-services/[storeId]` |
| PRODUCTS | `/tuotteet` | `/produkter` | `/products` |
| SPECIAL_EDITIONS | `/tuotteet/erikoiserat` | `/produkter/specialpartier` | `/products/special-editions` |
| PRODUCTS_BY_CATEGORY | `/tuotteet/[category]` | `/produkter/[category]` | `/products/[category]` |
| PRODUCT_BY_ID | `/tuotteet/[productId]/[productName]` | `/produkter/...` | `/products/[productId]/[productName]` |
| RECIPES | `/reseptit` | `/recept` | `/recipes` |
| FOOD_RECIPES | `/reseptit/ruokareseptit` | `/recept/matrecept` | `/recipes/food-recipes` |
| DRINK_RECIPES | `/reseptit/juomareseptit` | `/recept/dryck-recept` | `/recipes/drink-recipes` |
| DRINK_RECIPE_BY_SLUG_ID | `/reseptit/juomareseptit/[recipeSlugId]` | ... | `/recipes/drink-recipes/[recipeSlugId]` |
| FOOD_RECIPE_BY_SLUG_ID | `/reseptit/ruokareseptit/[recipeSlugId]` | ... | `/recipes/food-recipes/[recipeSlugId]` |
| ARTICLE_BY_SLUG | `/artikkelit/[slug]` | `/artiklar/[slug]` | `/articles/[slug]` |
| PAGE_BY_SLUG | `/sivu/[slug]` | `/sida/[slug]` | `/page/[slug]` |
| CHECK_OUT | `/kassa` | `/kassa` | `/checkout` |
| SHOPPING_CART_LOGIN | `/ostoskori-kirjautuminen` | `/kundvagn-inloggning` | `/shopping-cart-login` |
| GIFT_CARD | `/lahjakortti` | `/presentkort` | `/gift-card` |
| GIFT_CARD_BALANCE_CHECK | `/lahjakortti/tarkista-saldo` | ... | `/gift-card/check-balance` |
| STRONG_AUTHENTICATION | `/vahva-tunnistautuminen` | `/stark-autentisering` | `/strong-authentication` |
| ORDER_CONFIRMATION | `/tilausvahvistus` | `/orderbekraftelse` | `/order-confirmation` |
| IDENTIFICATION_UPDATE | `/tunnistautumisen-paivitys` | ... | `/identification-update` |
| CUSTOMER_SERVICE | `/palvelut/asiakaspalvelu` | `/tjanster/kundtjanst` | `/services/customer-service` |

Also: `/kaupat/{id}` 301 → `/fi/kaupat/{id}` (old store path; the new one is `/myymalat-palvelut`).

---

## 8. Verified dead paths (SPA catch-all)

All of these return the **SPA HTML shell** (not JSON) – i.e. the endpoints don't exist:

```
/api/store-stock/products
/api/store-stock/products?storeId=2102
/api/inventory/products
/api/availability/products?storeId=2102
/api/stores/2102/products            (+ ?pageSize=&page=)
/api/stores/2102/products/100001
/api/stores/2102/inventory
/api/stores-services/2102/products
```

**Conclusion:** there is no public bulk endpoint for per-store (product × store) unit-level inventory. alko.fi only shows the quantity for a single selected store (`selectedStore.amountAvailable`) via the store selector, one (product, store) request at a time. The only quantities you can fetch efficiently are the **online-warehouse** amounts (section 5, batched `/api/intershop/availability/webshop/...`).

---

## 9. Notes / next steps

- **Everything needed for the availability matrix (which stores carry each product) already comes for free** from the search sweep (`storeId[]` per product) → the current `product` map in availability.json is already "done" and needs no extra requests.
- To add **online stock per product**: one batched pass over `GET /api/intershop/availability/webshop/<id1>:<id2>:...` (and/or the already-included `webshopStock`/`limeStock`/`limeWebshopTotalStock`) → not a "gazillion" requests, at most a few dozen.
- Detail API key is `productId`, search API key is `id`; the merge is handled by `mergeProduct`. For campaign pricing, the search API format is canonical (`SEARCH_WINS_KEYS`).
- Older notes: the EAN field is gone from the API (noted as "RIP viivakoodinlukija"), `Uutuus`/`vintage` are detail-API only.