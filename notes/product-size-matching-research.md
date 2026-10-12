# Product size matching research

Investigated on 2026-09-28. Recommendation: use fully automatic, conservative product identity matching, then check for a different package. No manually maintained product groups, aliases, producer mappings, or product-specific exceptions. Keep fuzzy name similarity for search and discovery.

Implemented on 2026-09-28 in `src/lib/utils/product-variants.ts`, with one index per `Kaljakori` catalogue. The implementation preserves identity tokens, validates package annotations against structured fields, checks metadata, and includes the restricted Finnish lager suffix fallback below. It contains no product-ID, brand, or producer alias mappings. The research and prototype results below describe the investigation that led to this implementation.

Validation: 26 automated regression tests pass. An integration scan of the 13,319-product local snapshot produced 1,720 directed size links, with no self-links or asymmetric links. Selected real-product checks reject Sober Spirits G/R/W and IPA/Lager, preserve whisky ages, and recover the five Karhu III package alternatives. These checks establish regression behavior, not catalogue-wide matching accuracy. The Vite production build and repository type check pass after incorporating the latest main branch. The additional Bun product-prerender step was not run because Bun is unavailable in this environment.

## Reproduced failures

The function is named `findDifferentSizeOfProduct` in `src/lib/utils/filters.ts`. The product page calls it for “Muut koot”.

I ran the actual `Kaljakori`, normalization, similarity, and size-matching functions against the local `static/data.json`: 13,319 products, last synced 2026-08-14. I also inspected the live page for product 900960 and confirmed that it lists Sober Spirits W and R under “Muut koot”.

| Product pair                                           | Current normalized-name similarity | Problem                                                                                             |
| ------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| Sober Spirits G 900960 / R 901132                      | 0.9333                             | A single letter identifies a different drink.                                                       |
| Sober Spirits G 900960 / W 901133                      | 0.9333                             | Same issue; all three are already 0.5 L glass bottles.                                              |
| Suomenlinnan Ton Alkoholiton IPA 901982 / Lager 901981 | 0.8788                             | Roman-numeral removal damages IPA and Lager; shared text dominates the score. Both are 0.33 L cans. |
| Glenfiddich 12 001417 / 15 955417 / 18 955577          | 1.0000                             | Removing all numbers erases the age.                                                                |

The last failure also crosses actual sizes: Glenfiddich 12 (0.7 L, 001417) matches Glenfiddich 18 (0.05 L, 200050). Requiring a different volume alone does not solve product identity.

The reported IPA/Lager diagnosis is correct, but a bounded Roman-numeral regex is still too destructive. The catalogue includes `Christian Tschida Felsen I 2023` (900502) and `Christian Tschida Felsen II 2023` (900729), which currently collapse to the same name. Roman numerals can be part of the identity even when they occupy entire words. Other meaningful identifiers include `Senses MCM88` and whisky release numbers.

## Recommended implementation

Separate three operations, ideally in a dedicated `product-variants.ts` module:

1. `getProductIdentity(product)` creates a conservative name and metadata representation.
2. `areSameProduct(a, b)` first requires token-by-token name agreement and compatible metadata. A second, narrowly scoped comparison can recover class-like suffix differences using strong product metadata, as described below. Authoritative source relationships can supplement this if available.
3. `hasDifferentPackage(a, b)` checks volume, container type, and pack count where known.

### Name normalization

- Normalize Unicode, letter case, and repeated whitespace. Preserve meaningful punctuation. Compare remaining name tokens using a fixed Finnish search collation for limited accent equivalence, as discussed below; do not indiscriminately remove every diacritic.
- Remove recognized packaging phrases as whole tokens, using the structured packaging field. Do not remove arbitrary substrings. Handle repeated packaging suffixes: the dataset contains `1664 Blanc 5,0% tölkki tölkki`.
- Extract numeric pack counts such as `6-pack` and `18-pack` into the package descriptor. Do not use the current broad `\w+-pack` pattern.
- Remove a percentage annotation only when it agrees with the structured ABV. Keep ABV in the identity comparison.
- A trailing decimal such as `Karhu 4,6` can be handled by a narrow, documented rule when it equals the structured ABV. Do not remove arbitrary bare integers or decimal edition numbers such as `Waterford ... 1.2`.
- Remove an explicit volume annotation only when it is consistent with the package data. Parse multipack/unit-volume notation separately from total volume.
- If removing a year that equals the structured vintage, retain that vintage as a separate identity field. Preserve release years and other numbers.
- Preserve every remaining word, letter, age, number, and Roman numeral in the default identity. Thus `g`, `r`, `w`, `ipa`, `lager`, `12`, `15`, `18`, `i`, and `ii` remain distinguishing values. The restricted fallback below compares a secondary representation without changing this default identity.
- Reject an empty canonical name.

### Automatic name and metadata comparison

Require the same number of remaining tokens and agreement at every position. Do not average token scores, ignore extra words, or let a long shared brand prefix compensate for a different variant token. Start with order-preserving comparison; word reordering is another ambiguity rather than an automatic equivalence.

For alphabetic tokens, `new Intl.Collator('fi', { usage: 'search', sensitivity: 'base' })` offers a narrow automatic tolerance for accents. Local checks equated `Reserve`/`Réserve`, `Palinka`/`Pálinka`, `Gonzalez`/`González`, and `Napoleon`/`Napoléon`, while keeping `a`/`ä`, `o`/`ö`, `a`/`å`, `G`/`R`, and `IPA`/`Lager` distinct. Treat numeric and alphanumeric identifiers exactly after format normalization. Verify the chosen collation in supported browsers and fall back to exact equality if the Finnish locale is unavailable. This is a locale rule, not a product mapping.

Use ABV, vintage, country, and compatible category as guards. Preserve the existing same-vintage behavior by default: different known vintages are not automatically “other sizes”. Missing values are unknown, not automatically evidence of agreement; zero ABV is a valid value.

Producer identity is useful evidence, but raw producer equality is too strict. Valhalla 139586 is stored under `Anora Group`, while Valhalla 148781 is stored under `Altia Oyj`. Use producer agreement as additional evidence rather than a universal requirement for already-identical distinctive names. Require stronger producer evidence for generic names (for example, names containing only a grape/category), or leave them unmatched. Source category/grape labels and catalogue token frequencies can identify low-information names automatically; this extra gate needs catalogue validation before production. Do not infer that two producer companies are equivalent, or learn a global producer alias from a single matched pair. Do not make exact sugar, tasting-description, or wine taste-profile agreement mandatory; the existing examples show why those vary.

Category handling also needs to account for old data. Archived products still contain legacy categories such as `juomasekoitukset`; current products use `Panimotuotteet` plus a subtype. Prefer stable source category IDs for newly fetched products. Compare equivalent labels already present in the two category hierarchies where sufficient, but do not invent equivalences for incompatible historical records. Such records may remain unmatched until refreshed from the source. A broad category match is a guard, not proof of identity.

Start with token equality under the defined normalization/collation plus these guards. Genuine spelling errors and historical names may remain unmatched when evidence is insufficient. This is an intentional precision/coverage trade-off, with no manual maintenance required. A name-only algorithm cannot reliably infer all semantic equivalences from incomplete data. Additional structured evidence can recover some cases, including Karhu, through the restricted fallback below. Do not remove Roman numerals globally even at word boundaries, and do not form families through transitive fuzzy matches: A resembling B and B resembling C does not establish that A and C are the same drink.

A future automatic typo fallback could require exactly one edit in exactly one alphabetic token of at least six characters, exact agreement for every other token, strong independent metadata support, and an unambiguous candidate family. However, that threshold is a hypothesis, not established proof of identity. The catalogue experiment below found no non-accent examples supporting the need for this extra complexity. I recommend starting without general typo matching and testing it separately if real missed cases emerge.

For the section currently called “Muut koot”, the minimum is a real volume difference. If the intended feature also includes a can and bottle of the same volume, compare `(totalVolume, containerType, packCount)` and consider the clearer label “Muut pakkauskoot”. Pack count is not currently a standalone dataset field. Preserve it when parsing names or ingesting source data. Unknown/inferred bottle sizes should not be treated as authoritative package differences; `resolveBottleSize` currently falls back to 1 L.

### Recovering class-like suffixes automatically

Further investigation on 2026-09-28 showed that the Karhu trade-off can be reduced without product mappings. Alko's Karhu III page explicitly describes it as Karhu 4,6% in the producer's description. In the local catalogue, Karhu III and the five Karhu 4,6 packages agree on producer, country, lager style, 4.6% ABV, 10 degrees Plato, 16 EBU, 38 kcal/100 ml, and the normalized set of tasting descriptors.

Use a second matching pass with stricter evidence requirements than the ordinary exact-name path:

1. Restrict this initial rule to Finnish beers whose recorded style is lager. A trailing whole Roman-numeral token, optionally followed by a separate A/B qualifier, is a candidate for a strength-class annotation; it is not automatically declared one. This is a category/format rule with no product IDs or brand names embedded in it.
2. After ordinary package/verified-ABV normalization, allow that suffix to be absent on exactly one side. Require the remaining nonempty name to match exactly. Never use this rule to equate two different Roman suffixes, remove numerals inside a name, remove an age, or substitute an arbitrary word or letter.
3. Require nonempty equal producer, country, and style; equal known ABV; and present, positive, exactly equal original gravity, bitterness, and energy. For this fallback, also require at least four equal normalized tasting descriptors, compared as a set. These are corroborating fields, not a globally unique identifier.
4. Check for competing suffix identities with the same base name and matching evidence before filtering by package size. If more than one distinct suffix identity could attach to the same unmarked family, abstain. Multiple sizes of one identity are not ambiguity. Do not let same-size competitors disappear from this check.
5. Apply the ordinary different-package check and evaluate the relationship symmetrically. Preserve the original identity and record the internal match reason; do not permanently learn a global rule that a particular suffix or producer can always be ignored.

An in-memory scan of all 13,319 raw records found two suffix candidates under this narrow category rule: Karjala IV A and Karhu III. It added five package relationships for Karhu III (720914, 792176, 792178, 799424, 009213); Karjala received none under the strict evidence requirements. Focused negative checks rejected G/R, IPA/Lager, Glenfiddich 12/18, Felsen I/II, Mallaskoski Finn Barrel III/II, and Karhu III/5,3.

The experiment reads raw dataset values: missing measurements must not become corroborating zeroes. The current `Kaljakori` representation defaults several missing measurements to zero, so production code must preserve validity/provenance or obtain the raw known-value flags before using this evidence.

This demonstrates a useful recovery path, not a guarantee of perfect identity matching. Different beers can have copied descriptions or equal rounded measurements. Keep the fallback narrow, test competing-family cases and missing fields, and measure additional links separately from the default exact-name matches. Exact numeric measurements are intentionally required only for this fallback: legitimate ordinary size variants can have slightly different measurements. Broader fallback rules would need their own category-specific validation.

### Lookup and performance

Build a `Map` of canonical-name/ABV/vintage candidate groups once per `Kaljakori` dataset, alongside a product-ID lookup. Apply the remaining metadata and package checks within that small group. Keep missing-value rules explicit instead of encoding missing metadata as a wildcard. Because `Intl.Collator` does not expose a canonical key, an accent-folded key can retrieve candidates, but the final token comparator must still check them: sharing that coarse key is not sufficient for acceptance. Validate that candidate generation covers the selected collation equivalences, or use a broader ABV/vintage block for that fallback.

Return confirmed matches excluding the current product, with deterministic ordering by volume, container, and product ID. An empty result is valid. Replace the current score/sort/reverse/best-score loop with explicit acceptance criteria.

The implemented index uses ABV/vintage blocks sorted by the same Finnish collation used for comparison. Normalization is linear in the input text, and sorting costs up to O(N log N). Lookup uses binary search to locate the matching base-name group, then checks metadata and package differences within that group; it does not scan the full catalogue or calculate edit distances. Rebuilding `Kaljakori` rebuilds the index. Results are fresh, deterministically sorted arrays, and the product view no longer sorts them in place.

## Prototype results and trade-offs

An in-memory prototype used exact normalized names, type/country/ABV/vintage equality, and a volume-or-container difference. It did not implement the later collation extension, generic-name ambiguity checks, source relationships, category migration, or comprehensive package parsing, so these are exploratory results rather than validated production matching accuracy.

It produced the expected outcome on 14 selected pairs:

- Rejected G/R, G/W, IPA/Lager, Glenfiddich 12/15, and Glenfiddich 12/18.
- Kept Glenfiddich 12 in 0.7/0.2 L; Karhu in 0.33/0.5 L, six-packs, and eighteen-packs; Original Long Drink Pink Raspberry single/six-pack; Valhalla in 0.5/0.04 L; Gato Negro Sauvignon Blanc 2025 in 1/3 L; and the Red Grapefruit pair from the source comment.
- Rejected the Gato Negro 2025/2024 pair under the same-vintage policy.

The initial strict-name prototype left `Karhu III` / `Karhu 4,6` unmatched. The later metadata-backed suffix experiment above recovered this relationship without relaxing numeral preservation globally. The old 700013 spelling-error comment cannot currently serve as a typo regression: that product is now spelled correctly in this snapshot.

Across the snapshot, the prototype generated 441 candidate groups with package differences, containing 1,020 products. Of those groups, 103 contain different producer strings. These are counts of candidates, not confirmed families or precision/recall measurements. It also split 39 groups that currently have exactly identical normalized names; inspected examples include different whisky ages, numbered champagne editions, and Felsen I/II.

A second scan looked for a single Levenshtein edit in one alphabetic name token of at least six characters, with every other token identical and type/country/ABV/vintage equal. It found four candidate pairs, all with package differences, and all four differences were accents: Leclerc Briant Reserve/Réserve (931364/915907), Brill Palinka/Pálinka (900811/908606), González/Gonzalez Byass (300029/945895), and Tronnes Napoléon/Napoleon (198747/909494). This supports investigating narrow collation equivalence before adding general typo tolerance. It does not establish that all possible spelling problems in the catalogue were found, nor independently validate those pairs as identical products.

Before shipping, use a manually labelled positive/negative fixture set, including these failures, real name typos, short product names, meaningful Roman numerals, numerical brand names such as 1664, absent metadata, mixed old/new category data, removed products, same-size duplicates, and multipacks. Check symmetry and input-order independence. Audit added and removed links against the catalogue; do not treat current fuzzy matches as ground truth.

## Upstream-data option

`DetailedProductData` already declares `containerOptions: unknown[]` in `scripts/setup/types.ts`. The sync mapping does not persist it. This is worth validating before implementing a more elaborate matcher, but the name and type alone do not establish that it contains trustworthy sibling product IDs.

Direct requests to Alko's product-detail API returned HTTP 403 with a WAF challenge during this investigation, and browser navigation to that API was blocked. The regular Karhu product page was readable but did not provide a visible sibling-size selector. Consequently, the shape, coverage, and semantics of `containerOptions` remain unverified.

If valid variant relationships are confirmed, persist them during the existing sync, with explicit distinction between an absent/unfetched field and a successfully fetched empty list. Backfill existing products and periodically refresh relationship data: the current sync skips details when the search-field hash is unchanged, so simply adding a new saved field would leave many products unpopulated and relationship-only changes undetected. Serve the saved relationships from the static dataset; avoid an Alko API request on each product-page visit.

EAN/GTIN equality is not a replacement family key: package-volume changes require a new GTIN. Current API-synced rows also have null EANs.

## Sources

- Repository: `src/lib/utils/filters.ts`, `src/lib/utils/search.ts`, `src/lib/alko/index.ts`, `src/lib/components/views/Product.svelte`, `scripts/setup/types.ts`, `scripts/setup/constants.ts`, `scripts/setup/index.ts`, and the local catalogue snapshot described above.
- [Live reported product page](https://alkometriikka.fi/tuotteet/900960/): browser inspection confirmed R and W in “Muut koot”.
- [Alko Sober Spirits G](https://www.alko.fi/fi/tuotteet/900960/Sober-Spirits-G-0.0-/) and [Alko Sober Spirits R](https://www.alko.fi/fi/tuotteet/901132/Sober-Spirits-R-0.0-/): separate products, both 0.5 L and 0% ABV.
- [Alko Karhu III](https://www.alko.fi/fi/tuotteet/959618/karhu-iii): the producer description names Karhu 4,6%, and the page lists the same ABV, bitterness, original gravity, energy, and tasting profile used to corroborate the local comparison. [Sinebrychoff Karhu 4,6](https://www.sinebrychoff.fi/tuotteet/karhu/karhu-4-6/) provides the matching producer product description.
- [RapidFuzz token-set matching documentation](https://rapidfuzz.github.io/RapidFuzz/Usage/fuzz.html#token-set-ratio): token-set comparison can return a perfect score when one name is a subset of another. A generic token-based scorer therefore still needs identity constraints; replacing Levenshtein with token-set similarity is insufficient.
- [MDN Intl.Collator documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator): language-sensitive comparisons and locale-dependent base-letter equivalence. The specific Finnish comparisons above were verified locally rather than assumed from another language's examples.
- [GS1 declared net content rules](https://www.gs1.org/1/gtinrules/en/rule/266/declared-net-content): changes in declared net content require a new GTIN, so different-size packages do not share a barcode by design.
