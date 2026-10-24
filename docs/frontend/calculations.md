# Calculations

The numbers Alkometriikka derives from Alko's data, and the rules behind them.

## Drunk values

`calculateDrunkValue` (`src/lib/utils/catalog/alko.ts`) computes seven columns for every product, and the
same function powers the calculator at `/laskin` and the punch calculator's ‰ estimate.

Inputs: package size `V` (l), alcohol `p` (%), price `P` (€), and the user's weight `m` (kg) and
gender from settings. Without a saved weight the defaults are 86 kg (Mies), 76 kg (Nainen) and
79 kg (Muu / not set).

| Column                | Formula               | Notes                                                                          |
| --------------------- | --------------------- | ------------------------------------------------------------------------------ |
| `Alkoholigrammat`     | `g = V × p/100 × 789` | Ethanol density 789 g/l                                                        |
| `Alkoholigrammat / €` | `g / P`               | The default sort column                                                        |
| `Arvioidut promillet` | `g / (m × r)`         | Widmark formula, `r` = 0.68 for Mies, 0.55 otherwise. No elimination over time |
| `Promillet / €`       | `‰ / P`               |                                                                                |
| `Annokset`            | `g / 12`              | One Finnish standard drink = 12 g                                              |
| `€ / l (alk.)`        | `P / (V × p/100)`     | Price per litre of pure alcohol                                                |
| `€ / annos`           | `P / servings`        | Price per standard drink, shown with the price on product pages and list rows  |

Division by zero yields `0`. For `€ / l (alk.)` and `€ / annos` that 0 means an alcohol-free
product, not a free one (`zeroWithoutAlcoholColumns`): the list views sort it last in both
directions (`sortRows`), the comparison never highlights it as the best, and the details table
leaves the row out. Results are rounded to 2–4 decimals. Changing weight or gender in
settings updates `personalInfo`; views that depend on it (lists, categories, stats) rebuild their
`Kaljakori` subset with the new values.

## Punch calculator

`src/lib/utils/catalog/punch.ts`, used by [`/boolilaskuri`](features.md#punch-calculator-boolilaskuri).

Each ingredient is an Alko product (by number) or the user's own (name, package size, ABV,
price), times a package count that may be fractional. `computePunch` adds them up:

- volume `V = Σ size × count`, pure alcohol `A = Σ size × count × abv/100`, price `P = Σ price × count`
- strength `A / V`, grams `A × 789`, servings `grams / 12`, and `P / servings`, `P / V`, `grams / P`
- glasses `V / glass size`; per glass and per person are the totals scaled by `glass / V` and
  `1 / people`
- ‰ is `calculateDrunkValue` on the whole bowl, scaled the same way

`mixerForTarget` gives the litres of alcohol-free mixer that dilute the bowl to a target strength:
`A / target − V`, or 0 when it's mild enough already.

**Templates** name their Alko ingredients by type, subtype, sizes and a minimum ABV
(`ProductPick`). `pickProduct` takes the active product with the cheapest `€ / annos`, among those
in the preferred store when it has any.

**Cheaper swaps** (`cheaperAlternative`): the active product with the same type, subtype and beer
style, ABV within 1 percentage point and a lower price per litre, bought in whole packages that
come to 85–120 % of the current amount, that saves the most. Shown when it saves at least 0.50 €.
With a preferred store and store data, only products in that store count.

**Sharing**: `encodePunch` writes the recipe as arrays (half the length of objects) and
compresses it with lz-string into `?booli=`. `decodePunch` and `sanitizePunch` (also used for
localStorage) clamp every value and drop malformed ingredients.

## Sales

`getSaleInfo` (`src/lib/utils/catalog/sales.ts`), shared by the app, the sync, the prerender and RSS.

A product is **on sale** when:

1. it has a positive price and a `Normaalihinta` (Alko's `lowest_30d_price`) above that price, and
2. today falls inside `Kampanja alkaa`…`Kampanja päättyy`, when those dates are present.

The discount is `round((1 − price / normalPrice) × 100)` %. The date check means a campaign that
ended between syncs stops showing as a sale on its own. The product page, badges
("Alennus −N %"), the `Alennuksessa` filter and the prerendered stubs all use it. Price history
points recorded during a campaign keep the campaign window so the price chart can shade past sale
periods (`ProductPriceHistory.svelte`).

## Quality metrics ("Hinta-laatu")

`computeQualityMetrics` (`src/lib/utils/stats/metrics.ts`) ranks a product against its peers on the
product page. Peers are the active products in the same category page (the Alatyyppi, or the whole
Tyyppi when the user switches to the parent category).

| Metric             | Column                | Better when |
| ------------------ | --------------------- | ----------- |
| Hintataso          | `Litrahinta`          | lower       |
| Alkoholia rahalle  | `Alkoholigrammat / €` | higher      |
| Sokeripitoisuus    | `Sokeri g/l`          | lower       |
| Promillet per euro | `Promillet / €`       | higher      |

Each value is a percentile: the share of peers the product is at least as good as, so 100 always
means best. The result also carries the peer group's median price per litre.

## Category statistics

`computeCategoryStats` (`metrics.ts`) gives a category page its medians (price, price per litre,
ABV, alcohol per euro) and a 10-bin price-per-litre histogram. The histogram spans the 5th–95th
percentile so a few extreme bottles don't flatten it; values outside are counted in the edge bins.

`pickCategoryHighlights` picks up to four products for the category's "compare highlights" link:
most alcohol per euro, cheapest, lowest price per litre, then the next best by alcohol per euro.

`src/lib/utils/stats/stats.ts` has the whole-catalog equivalents used by `/tilastot`: banded histograms
(price, price per litre, ABV), category/subcategory/country distributions, summary totals, and
the best-value ranking.

## Price changes

`recentPriceChanges(products, since)` (`metrics.ts`) returns each product's **latest** price
change on or after `since`, newest first. A change is two consecutive price-history points with
different prices. It's flagged as a sale when the new point has a `normalPrice` above its price.
The price changes page and the category sidebar use it; formatting and URL helpers are in
`src/lib/utils/stats/priceChanges.ts`.

## Comparison

`computeComparisonRows` (`metrics.ts`) builds the `/vertailu` table: one row per dataset or drunk
column that at least one product has a value for (minus `hideFromProductPageStats`). Columns in
`comparisonBestDirection` (price, price per litre, normal price, alcohol per euro, ‰ per euro,
€ per litre of alcohol, sugar, servings, energy) highlight the best cell; ties all win. Columns
without an objectively better direction (country, colour, bitterness…) are never highlighted.

## Similar products

`findSimilarProducts` (`src/lib/utils/catalog/filters.ts`) scores every product against the target on
`SIMILAR_PRODUCT_COLUMNS` (Tyyppi, Alatyyppi, Oluttyyppi, Hinta, Pullokoko, Sokeri,
Pakkaustyyppi, Alkoholigrammat / €, Rypäleet, Luonnehdinta):

- Numeric columns add up to 1 point, linearly decreasing to 0 at a 20 % difference.
- String columns add 1 point when equal.
- The total is then multiplied by a factor for shared grapes and shared taste descriptors
  (`1 + overlap share`, doubled), so products that taste alike rise to the top.

The product page shows the top 24 active products; `/vastaavat/[id]` lists them all.

## Other sizes

The product page's size selector ("Pakkauskoko") lists other packages of the same drink, found by
`ProductVariantIndex` (`src/lib/utils/catalog/productVariants.ts`). Fuzzy name similarity was tried and
rejected: it matched different drinks whose names differ by one meaningful token (Sober Spirits
G/R/W, IPA vs Lager, Glenfiddich 12 vs 18). The research is in
[`notes/product-size-matching-research.md`](../../notes/product-size-matching-research.md).

The matcher is deliberately conservative, with no product-specific mappings:

1. **Normalize the name.** Lower-case and NFKC-normalize, then remove only annotations that agree
   with structured data: the packaging word (e.g. "tölkki"), `N-pack` / `N x 0,33 l` multipack
   notation, a volume equal to the package size, an ABV equal to the product's ABV, a year equal
   to the vintage, and a trailing decimal equal to the ABV ("Karhu 4,6"). Every other token,
   including ages, numbers and Roman numerals, stays.
2. **Same name.** Token by token, same count, same order. Tokens containing digits must be equal;
   letters are compared with a Finnish search collator, so accents are tolerated (Réserve =
   Reserve) but å/ä/ö stay distinct.
3. **Compatible metadata.** Equal ABV and vintage, same country, compatible category (including the
   old category hierarchy on removed products), same beer style for beers.
4. **Enough evidence.** Same producer, or a name with at least one word that isn't a generic
   category, style or grape word. "Merlot" from two producers isn't one drink.
5. **Different package.** Different volume, pack count or container type. Products whose size was
   inferred rather than declared never match.

A narrow fallback handles Finnish lagers sold with and without a strength-class suffix (Karhu III
= Karhu 4,6): it requires the same producer, country, style and ABV, identical positive original
gravity, bitterness and energy, and at least four identical taste descriptors, and it abstains if
more than one suffix could claim the same product.

Products are bucketed by ABV and vintage and sorted by name, so a lookup is a binary search plus a
check of a few candidates. `buildSizeOptions` then drops removed sizes, sorts by pack count and
size, and marks the cheapest per litre.
