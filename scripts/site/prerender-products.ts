import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import Bun, { CryptoHasher } from "bun";
import { getSaleInfo, toISODateInTimeZone } from "../../src/lib/utils/sales.ts";
import { ogImageUrl } from "../og/og";
import { CATEGORY_OG_MANIFEST_FILE, categoryOgUrl, type CategoryOgManifest } from "../og/og-category-card";
import {
  buildCategoryTree,
  categoryDescription,
  categoryFeedPath,
  categorySlug,
  categoryTitle,
  CATEGORY_BASE_PATH,
  CATEGORY_INDEX_DESCRIPTION,
  findProductCategoryTrail,
  type CategoryNode
} from "../../src/lib/utils/categories.ts";
import { readOption } from "../lib/cli";
import type { StoredDataset, StoredProduct } from "../../src/lib/utils/dataset.ts";
import { mapPool } from "../lib/async";
import { escapeHtml } from "../lib/html";
import { breadcrumbJsonLd, breadcrumbNav, renderStub, SITE_URL, type StubPage } from "../lib/stub";
import { productDescription } from "../../src/lib/utils/seo.ts";

type PrerenderManifestEntry = {
  key: string;
  pageId: string;
};

type PrerenderManifest = Record<string, PrerenderManifestEntry>;

// Bump when the page rendering logic (productHtml, minifyHtml, the SEO
// template, ...) changes in a way that can alter existing pages without the
// template or product data changing, forcing a full re-render.
const RENDER_VERSION = 6;

function sha256Hex(value: string): string {
  const hasher = new CryptoHasher("sha256");
  hasher.update(value);
  return hasher.digest("hex");
}

// Content-addressable key for a product page. Every input that can change the
// rendered HTML — the rendering logic version, the schema, the raw product
// data, the page template (new JS/CSS hashes invalidate every page) and the
// product's OG image key and category trail, plus today's date for products
// with a campaign (their sale state is date-dependent) — is hashed, so unchanged
// pages can be skipped.
function productKey(
  schema: readonly string[],
  product: StoredProduct,
  templateFingerprint: string,
  ogKey: string | null,
  categoryTrail: CategoryNode[],
  saleDay: string | null
): string {
  return sha256Hex(
    JSON.stringify([
      RENDER_VERSION,
      schema,
      product.values,
      product.meta ?? null,
      product.priceHistory ?? null,
      templateFingerprint,
      ogKey,
      categoryTrail.map((node) => [node.name, node.path]),
      saleDay
    ])
  );
}

type Options = {
  dataPath: string;
  outputPath: string;
  templatePath: string;
  ogManifestPath: string;
  ogCategoriesManifestPath: string;
  manifestPath: string;
};

async function readManifest(filePath: string): Promise<PrerenderManifest> {
  return Bun.file(filePath)
    .json()
    .then((value) =>
      value && typeof value === "object" && !Array.isArray(value) ? (value as PrerenderManifest) : {}
    )
    .catch(() => ({}));
}

function resolveOptions(): Options {
  const outputPath = path.resolve(readOption("--out") ?? "build");
  return {
    dataPath: path.resolve(readOption("--data") ?? path.join(outputPath, "data.json")),
    outputPath,
    templatePath: path.resolve(readOption("--template") ?? path.join(outputPath, "404.html")),
    ogManifestPath: path.resolve(readOption("--og-manifest") ?? path.join(outputPath, "og-images.json")),
    ogCategoriesManifestPath: path.resolve(
      readOption("--og-categories-manifest") ?? path.join(outputPath, CATEGORY_OG_MANIFEST_FILE)
    ),
    manifestPath: path.resolve(readOption("--manifest") ?? path.join(outputPath, "tuotteet-manifest.json"))
  };
}


function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join(", ");
  return value === null || value === undefined ? "" : String(value).trim();
}

function formatNumber(value: unknown, suffix: string): string {
  const text = asText(value);
  if (!text) return "";
  const number = typeof value === "number" ? value : Number(text);
  return Number.isFinite(number) ? `${number.toLocaleString("fi-FI")} ${suffix}` : text;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const number = Number(asText(value).replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function property(
  name: string,
  value: unknown,
  suffix?: string
): { "@type": "PropertyValue"; name: string; value: string } | null {
  const text = suffix ? formatNumber(value, suffix) : asText(value);
  return text ? { "@type": "PropertyValue", name, value: text } : null;
}

function parsePrice(value: unknown, productId: string): number {
  const price = typeof value === "number" ? value : Number(asText(value).replace(",", "."));
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid price for product ${productId}: ${asText(value) || "(empty)"}`);
  }
  return price;
}

/** True when a per-product RSS feed has at least one recorded price change to list. */
function hasPriceChange(history?: { date: string; price: number }[]): boolean {
  if (!Array.isArray(history) || history.length < 2) return false;
  for (let index = 1; index < history.length; index += 1) {
    if (history[index].price !== history[index - 1].price) return true;
  }
  return false;
}

function productHtml(
  template: string,
  schema: string[],
  product: StoredProduct,
  ogImageKey: string | null,
  categoryTrail: CategoryNode[]
): { html: string; id: string } {
  const fields = Object.fromEntries(schema.map((column, index) => [column, product.values[index]]));
  const id = asText(fields.Numero);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Invalid product id: ${id || "(empty)"}`);

  const name = asText(fields.Nimi) || `Tuote ${id}`;
  const manufacturer = asText(fields.Valmistaja);
  const type = asText(fields.Tyyppi);
  const subtype = asText(fields.Alatyyppi);
  const descriptionValue = asText(fields.Luonnehdinta);
  const title = `${name} - Alkometriikka`;
  const url = `${SITE_URL}/tuotteet/${encodeURIComponent(id)}/`;
  const image = `https://images.alko.fi/images/cs_srgb,f_auto,t_medium/cdn/${encodeURIComponent(id)}/kuva.jpg`;
  const ogImage = ogImageKey ? ogImageUrl(ogImageKey) : image;
  const imageVariants = [
    image,
    `https://images.alko.fi/images/cs_srgb,f_auto,t_products/cdn/${encodeURIComponent(id)}/kuva.jpg`
  ];
  const price = parsePrice(fields.Hinta, id);
  const keywords = [name, manufacturer, type, subtype, descriptionValue].filter(Boolean).join(", ");
  const category = [type, subtype].filter(Boolean).join(" / ");
  const volume = asNumber(fields.Pullokoko);
  const pricePerLitre = asNumber(fields.Litrahinta);
  const metaDescription = productDescription({
    name,
    category,
    volume,
    alcoholPercentage: asNumber(fields["Alkoholi-%"]),
    price,
    pricePerLitre
  });
  const sale = getSaleInfo(
    {
      price,
      normalPrice: fields.Normaalihinta,
      campaignStart: fields["Kampanja alkaa"],
      campaignEnd: fields["Kampanja päättyy"]
    },
    toISODateInTimeZone("Europe/Helsinki")
  );
  const additionalProperties = [
    property("Valmistusmaa", fields.Valmistusmaa),
    property("Alue", fields.Alue),
    property("Vuosikerta", fields.Vuosikerta),
    property("Rypäleet", fields.Rypäleet),
    property("Pakkaustyyppi", fields.Pakkaustyyppi),
    property("Suljentatyyppi", fields.Suljentatyyppi),
    property("Alkoholiprosentti", fields["Alkoholi-%"], "%"),
    property("Hapot", fields["Hapot g/l"], "g/l"),
    property("Sokeri", fields["Sokeri g/l"], "g/l"),
    property("Kantavierre", fields["Kantavierrep-%"], "%"),
    property("Väri", fields["Väri EBC"], "EBC"),
    property("Katkerot", fields["Katkerot EBU"], "EBU"),
    property("Energia", fields["Energia kcal/100 ml"], "kcal/100 ml"),
    property("Valikoima", fields.Valikoima)
  ].filter((entry) => entry !== null);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": url,
    inLanguage: "fi-FI",
    name,
    sku: id,
    url,
    image: imageVariants,
    description: descriptionValue || metaDescription,
    hasAdultConsideration: "https://schema.org/AlcoholConsideration",
    ...(manufacturer ? { brand: { "@type": "Brand", name: manufacturer } } : {}),
    ...(asText(fields.Valmistusmaa) ? { countryOfOrigin: asText(fields.Valmistusmaa) } : {}),
    ...(volume !== null ? { size: `${volume} L` } : {}),
    ...(category ? { category } : {}),
    ...(additionalProperties.length ? { additionalProperty: additionalProperties } : {}),
    ...(!product.meta?.removedFromSelection ? { sameAs: `https://www.alko.fi/tuotteet/${id}` } : {}),
    offers: {
      "@type": "Offer",
      url,
      price,
      priceCurrency: "EUR",
      valueAddedTaxIncluded: true,
      seller: { "@type": "Organization", name: "Alko", url: "https://www.alko.fi" },
      ...(sale && (sale.campaignStart || sale.campaignEnd)
        ? {
            ...(sale.campaignStart ? { validFrom: sale.campaignStart } : {}),
            ...(sale.campaignEnd ? { priceValidUntil: sale.campaignEnd } : {})
          }
        : {}),
      ...(pricePerLitre || sale
        ? {
            priceSpecification: [
              ...(sale
                ? [
                    {
                      "@type": "UnitPriceSpecification",
                      priceType: "https://schema.org/StrikethroughPrice",
                      price: sale.normalPrice,
                      priceCurrency: "EUR"
                    }
                  ]
                : []),
              ...(pricePerLitre
                ? [
                    {
                      "@type": "UnitPriceSpecification",
                      price: pricePerLitre, // The strict per-litre price directly from the API
                      priceCurrency: "EUR",
                      referenceQuantity: {
                        "@type": "QuantitativeValue",
                        value: 1,
                        unitCode: "LTR"
                      }
                    }
                  ]
                : [])
            ]
          }
        : {}),
      itemCondition: "https://schema.org/NewCondition",
      availability: product.meta?.removedFromSelection
        ? "https://schema.org/Discontinued"
        : "https://schema.org/InStock"
    }
  };

  const breadcrumbList = breadcrumbJsonLd([
    ...categoryTrail.map((node) => ({ name: node.name, url: `${SITE_URL}${node.path}` })),
    { name, url }
  ]);

  const facts = [
    ["Valmistaja", manufacturer],
    ["Tuotetyyppi", category],
    ["Valmistusmaa", asText(fields.Valmistusmaa)],
    ["Alue", asText(fields.Alue)],
    ["Pullokoko", formatNumber(fields.Pullokoko, "l")],
    ["Alkoholia", formatNumber(fields["Alkoholi-%"], "%")],
    ["Hinta", formatNumber(fields.Hinta, "€")],
    ["Litrahinta", formatNumber(fields.Litrahinta, "€/l")],
    ["Valikoima", asText(fields.Valikoima)]
  ].filter((entry) => entry[1]);

  const page: StubPage = {
    title,
    description: metaDescription,
    url,
    keywords,
    ogType: "product",
    ogImage,
    ogImageAlt: name,
    alternates: hasPriceChange(product.priceHistory)
      ? [
          `\t<link rel="alternate" type="application/rss+xml" data-prerendered title="${escapeHtml(
            `${name} – hintamuutokset`
          )}" href="${escapeHtml(`${SITE_URL}/rss/${encodeURIComponent(id)}.xml`)}" />`
        ]
      : [],
    ogExtra: [
      `\t<meta property="product:price:amount" content="${price}" />`,
      `\t<meta property="product:price:currency" content="EUR" />`
    ],
    jsonLd: [jsonLd, breadcrumbList],
    fallbackName: "product",
    fallbackHtml: `\t\t${breadcrumbNav(categoryTrail)}
\t\t<header>
\t\t\t<h1>${escapeHtml(name)}</h1>
\t\t\t${manufacturer ? `<p>${escapeHtml(manufacturer)}</p>` : ""}
\t\t</header>
\t\t<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" width="320" height="384" />
\t\t${descriptionValue ? `<p>${escapeHtml(descriptionValue)}</p>` : ""}
\t\t<dl>${facts.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>`
  };
  return { html: renderStub(template, page), id };
}

type CategoryProduct = {
  id: string;
  name: string;
  price: number;
  alcoholPerEuro: number;
  typeSlug: string;
  subTypeSlug: string;
};

const CATEGORY_LIST_LIMIT = 100;
const CATEGORY_ITEM_LIST_LIMIT = 20;

function categoryProduct(schema: string[], product: StoredProduct): CategoryProduct | null {
  if (product.meta?.removedFromSelection) return null;
  const fields = Object.fromEntries(schema.map((column, index) => [column, product.values[index]]));
  const id = asText(fields.Numero);
  const price = asNumber(fields.Hinta);
  if (!id || !price) return null;
  const volume = asNumber(fields.Pullokoko) ?? 0;
  const percentage = asNumber(fields["Alkoholi-%"]) ?? 0;
  return {
    id,
    name: asText(fields.Nimi) || `Tuote ${id}`,
    price,
    // Same ordering as the app's default sort (alcohol grams per euro)
    alcoholPerEuro: (volume * percentage) / price,
    typeSlug: categorySlug(asText(fields.Tyyppi)),
    subTypeSlug: categorySlug(asText(fields.Alatyyppi))
  };
}

/** Renders a category page, or the /kategoriat/ index when `trail` is empty. */
function categoryHtml(
  template: string,
  tree: CategoryNode[],
  trail: CategoryNode[],
  products: CategoryProduct[],
  ogKey: string | undefined
): string {
  const node = trail.at(-1);
  const name = node ? categoryTitle(trail) : "Kategoriat";
  const title = `${name} - Alkometriikka`;
  const description = node ? categoryDescription(trail) : CATEGORY_INDEX_DESCRIPTION;
  const url = `${SITE_URL}${node ? node.path : `${CATEGORY_BASE_PATH}/`}`;
  // The page's own card from og-categories.json, else the generic image (e.g. before the first card run)
  const ogImage = ogKey ? categoryOgUrl(ogKey) : `${SITE_URL}/images/og_image.png`;
  const ogImageAlt = ogKey ? `${name} – Alkometriikka` : "Alkometriikka logo";
  const links = node ? (trail.length > 1 ? [] : node.children) : tree;
  const productUrl = (product: CategoryProduct) => `${SITE_URL}/tuotteet/${encodeURIComponent(product.id)}/`;

  const breadcrumbList = breadcrumbJsonLd([
    ...(node ? [] : [{ name: "Kategoriat", url }]),
    ...trail.map((item) => ({ name: item.name, url: `${SITE_URL}${item.path}` }))
  ]);
  const collectionPage = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": url,
    url,
    name,
    description,
    inLanguage: "fi-FI",
    isPartOf: { "@type": "WebSite", name: "Alkometriikka", url: `${SITE_URL}/` },
    ...(node
      ? {
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: node.count,
            itemListElement: products.slice(0, CATEGORY_ITEM_LIST_LIMIT).map((product, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: product.name,
              url: productUrl(product)
            }))
          }
        }
      : {})
  };

  const linkList = links.length
    ? `<ul>${links
        .map((item) => `<li><a href="${escapeHtml(item.path)}">${escapeHtml(item.name)}</a> (${item.count})</li>`)
        .join("")}</ul>`
    : "";
  const productList = products.length
    ? `<ol>${products
        .slice(0, CATEGORY_LIST_LIMIT)
        .map(
          (product) =>
            `<li><a href="/tuotteet/${escapeHtml(encodeURIComponent(product.id))}/">${escapeHtml(product.name)}</a> ${escapeHtml(
              formatNumber(product.price, "€")
            )}</li>`
        )
        .join("")}</ol>`
    : "";

  const page: StubPage = {
    title,
    description,
    url,
    keywords: ["alko", ...trail.map((item) => item.name)].join(", "),
    ogImage,
    ogImageAlt,
    alternates: node
      ? [
          `\t<link rel="alternate" type="application/rss+xml" data-prerendered title="${escapeHtml(
            `${name} – uutuudet ja hinnanmuutokset`
          )}" href="${escapeHtml(`${SITE_URL}${categoryFeedPath(trail[0].slug, trail[1]?.slug)}.xml`)}" />`
        ]
      : [],
    jsonLd: [collectionPage, breadcrumbList],
    fallbackName: "category",
    fallbackHtml: `\t\t${breadcrumbNav(trail.slice(0, -1))}
\t\t<h1>${escapeHtml(node ? node.name : "Kategoriat")}</h1>
\t\t<p>${escapeHtml(description)}</p>
\t\t${linkList}
\t\t${productList}`
  };
  return renderStub(template, page);
}

/** Category pages are few and cheap, so they're fully regenerated every run. */
async function renderCategoryPages(
  outputPath: string,
  template: string,
  tree: CategoryNode[],
  products: CategoryProduct[],
  ogManifest: CategoryOgManifest
): Promise<number> {
  const categoriesPath = path.join(outputPath, ...CATEGORY_BASE_PATH.split("/").filter(Boolean));
  await rm(categoriesPath, { recursive: true, force: true });
  const sorted = [...products].sort((a, b) => b.alcoholPerEuro - a.alcoholPerEuro);

  const pages: { trail: CategoryNode[]; products: CategoryProduct[] }[] = [{ trail: [], products: [] }];
  for (const type of tree) {
    pages.push({ trail: [type], products: sorted.filter((product) => product.typeSlug === type.slug) });
    for (const subType of type.children) {
      pages.push({
        trail: [type, subType],
        products: sorted.filter(
          (product) => product.typeSlug === type.slug && product.subTypeSlug === subType.slug
        )
      });
    }
  }

  for (const page of pages) {
    const directory = path.join(categoriesPath, ...page.trail.map((node) => node.slug));
    await mkdir(directory, { recursive: true });
    const pagePath = page.trail.at(-1)?.path ?? `${CATEGORY_BASE_PATH}/`;
    await Bun.write(
      path.join(directory, "index.html"),
      categoryHtml(template, tree, page.trail, page.products, ogManifest[pagePath])
    );
  }
  return pages.length;
}

async function main() {
  const options = resolveOptions();

  // The dataset is deployed separately by the fetch-data workflow and is not
  // part of the repo (it is gitignored). When it is unavailable — first
  // deploy, or a gh-pages dataset that has not been regenerated yet — skip
  // product prerendering instead of failing the whole site build. The
  // fetch-data workflow will populate the dataset and product pages afterwards.
  if (!(await Bun.file(options.dataPath).exists())) {
    console.warn(
      `⚠️  Dataset not found at ${options.dataPath}; skipping product prerendering.`
    );
    return;
  }

  const [dataset, template, ogManifest] = await Promise.all([
    Bun.file(options.dataPath).json() as Promise<StoredDataset>,
    Bun.file(options.templatePath).text(),
    Bun.file(options.ogManifestPath)
      .json()
      .then((value) => value as Record<string, string>)
      .catch(() => ({}) as Record<string, string>)
  ]);

  if (!Array.isArray(dataset.schema) || !dataset.schema.every((column) => typeof column === "string")) {
    throw new Error(`Invalid schema in ${options.dataPath}`);
  }
  if (!dataset.products || typeof dataset.products !== "object") {
    throw new Error(`No products found in ${options.dataPath}`);
  }

  const schema = dataset.schema;
  const products = dataset.products;
  const productsPath = path.join(options.outputPath, "tuotteet");

  const previous = await readManifest(options.manifestPath);
  const manifest: PrerenderManifest = {};
  const templateFingerprint = sha256Hex(template);
  const keptPageIds = new Set<string>();
  const generatedIds = new Set<string>();

  const today = toISODateInTimeZone("Europe/Helsinki");
  const campaignIndexes = ["Kampanja alkaa", "Kampanja päättyy"].map((column) => schema.indexOf(column));
  const typeIndex = schema.indexOf("Tyyppi");
  const subTypeIndex = schema.indexOf("Alatyyppi");
  const validProducts = Object.values(products).filter(
    (product): product is StoredProduct => !!product && Array.isArray(product.values)
  );
  const categoryTree = buildCategoryTree(
    validProducts.map((product) => ({
      type: product.values[typeIndex],
      subType: product.values[subTypeIndex],
      removed: Boolean(product.meta?.removedFromSelection)
    }))
  );

  let count = 0;
  let skipped = 0;
  const concurrency = Number(process.env.ALKO_PRERENDER_CONCURRENCY) || 32;
  await mapPool(Object.entries(products), concurrency, async ([productId, product]) => {
    if (!product || !Array.isArray(product.values)) return;
    const ogKey = ogManifest[productId] ?? null;
    const categoryTrail = findProductCategoryTrail(
      categoryTree,
      product.values[typeIndex],
      product.values[subTypeIndex]
    ).trail;
    // Sale state depends on today's date, so a campaign starting or ending
    // without a data change must still re-render the page.
    const hasCampaign = campaignIndexes.some((index) => asText(product.values[index]));
    const key = productKey(schema, product, templateFingerprint, ogKey, categoryTrail, hasCampaign ? today : null);
    const previousEntry = previous[productId];
    const previousPageId = previousEntry?.pageId;
    const previousFile = previousPageId
      ? path.join(productsPath, previousPageId, "index.html")
      : null;
    if (
      previousEntry &&
      previousEntry.key === key &&
      previousFile &&
      (await Bun.file(previousFile).exists())
    ) {
      manifest[productId] = previousEntry;
      keptPageIds.add(previousPageId);
      skipped += 1;
      return;
    }
    const rendered = productHtml(template, schema, product, ogKey, categoryTrail);
    if (generatedIds.has(rendered.id)) throw new Error(`Duplicate product id: ${rendered.id}`);
    generatedIds.add(rendered.id);
    const directory = path.join(productsPath, rendered.id);
    await mkdir(directory, { recursive: true });
    await Bun.write(path.join(directory, "index.html"), rendered.html);
    manifest[productId] = { key, pageId: rendered.id };
    keptPageIds.add(rendered.id);
    count += 1;
  });

  // Prune directories for products that dropped out of the dataset (or were
  // replaced under a different page id) so stale pages never linger on the
  // deployed site.
  let existing: string[] = [];
  try {
    existing = await readdir(productsPath);
  } catch {
    existing = [];
  }
  for (const entry of existing) {
    if (!keptPageIds.has(entry)) {
      await rm(path.join(productsPath, entry), { recursive: true, force: true });
    }
  }

  const sortedManifest = Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );

  if (Object.keys(sortedManifest).length === 0) {
    throw new Error(`No product pages were generated`);
  }

  await mkdir(path.dirname(options.manifestPath), { recursive: true });
  await Bun.write(options.manifestPath, JSON.stringify(sortedManifest));

  const categoryPages = await renderCategoryPages(
    options.outputPath,
    template,
    categoryTree,
    validProducts.map((product) => categoryProduct(schema, product)).filter((product) => product !== null),
    await Bun.file(options.ogCategoriesManifestPath)
      .json()
      .then((value) => value as CategoryOgManifest)
      .catch(() => ({}) as CategoryOgManifest)
  );

  console.log(
    `Category pages: ${categoryPages.toLocaleString("en-US")} | ` +
    `Product pages: ${Object.keys(sortedManifest).length.toLocaleString("en-US")} total, ` +
      `${count.toLocaleString("en-US")} regenerated, ${skipped.toLocaleString("en-US")} unchanged | ` +
      `manifest → ${options.manifestPath}`
  );
}

await main();
