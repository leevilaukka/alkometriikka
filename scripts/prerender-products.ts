import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import Bun, { CryptoHasher } from "bun";
import { getSaleInfo, toISODateInTimeZone } from "../src/lib/utils/sales.ts";
import { ogImageUrl } from "./og";
import { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from "./og";

type ProductRecord = {
  values: unknown[];
  meta?: {
    removedFromSelection?: string;
  };
  priceHistory?: { date: string; price: number }[];
};

type Dataset = {
  schema?: unknown;
  products?: Record<string, ProductRecord>;
};

type PrerenderManifestEntry = {
  key: string;
  pageId: string;
};

type PrerenderManifest = Record<string, PrerenderManifestEntry>;

// Bump when the page rendering logic (productHtml, minifyHtml, the SEO
// template, ...) changes in a way that can alter existing pages without the
// template or product data changing, forcing a full re-render.
const RENDER_VERSION = 2;

function sha256Hex(value: string): string {
  const hasher = new CryptoHasher("sha256");
  hasher.update(value);
  return hasher.digest("hex");
}

// Content-addressable key for a product page. Every input that can change the
// rendered HTML — the rendering logic version, the schema, the raw product
// data, the page template (new JS/CSS hashes invalidate every page) and the
// product's OG image key — is hashed, so unchanged pages can be skipped.
function productKey(
  schema: readonly string[],
  product: ProductRecord,
  templateFingerprint: string,
  ogKey: string | null
): string {
  return sha256Hex(
    JSON.stringify([
      RENDER_VERSION,
      schema,
      product.values,
      product.meta ?? null,
      product.priceHistory ?? null,
      templateFingerprint,
      ogKey
    ])
  );
}

type Options = {
  dataPath: string;
  outputPath: string;
  templatePath: string;
  ogManifestPath: string;
  manifestPath: string;
};

const SITE_URL = "https://alkometriikka.fi";
const SEO_START = "<!-- Dynamic SEO data start -->";
const SEO_END = "<!-- Dynamic SEO data end -->";

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

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
    manifestPath: path.resolve(readOption("--manifest") ?? path.join(outputPath, "tuotteet-manifest.json"))
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

// Collapses whitespace runs to a single space while leaving quoted strings and
// CSS comments untouched (internal whitespace there is significant).
function collapseCssWhitespace(css: string): string {
  let out = "";
  let mode: "code" | "string" | "comment" = "code";
  let quote = "";
  let i = 0;
  while (i < css.length) {
    const char = css[i];
    if (mode === "comment") {
      out += char;
      i += 1;
      if (char === "*" && css[i] === "/") {
        out += "/";
        i += 1;
        mode = "code";
      }
      continue;
    }
    if (mode === "string") {
      out += char;
      i += 1;
      if (char === quote) {
        mode = "code";
      } else if (char === "\\") {
        out += css[i] ?? "";
        i += 1;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      mode = "string";
      quote = char;
      out += char;
      i += 1;
      continue;
    }
    if (char === "/" && css[i + 1] === "*") {
      mode = "comment";
      out += "/*";
      i += 2;
      continue;
    }
    if (/[ \t\r\n]/.test(char)) {
      while (i < css.length && /[ \t\r\n]/.test(css[i])) i += 1;
      out += " ";
      continue;
    }
    out += char;
    i += 1;
  }
  return out;
}

// Collapses whitespace runs between attributes to a single space, keeping
// quoted attribute values untouched.
function collapseTagWhitespace(tag: string): string {
  let out = "";
  let quote = "";
  for (let i = 0; i < tag.length; i += 1) {
    const char = tag[i];
    if (quote) {
      out += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      out += char;
      continue;
    }
    if (/[ \t\r\n]/.test(char)) {
      while (i < tag.length && /[ \t\r\n]/.test(tag[i])) i += 1;
      out += " ";
      i -= 1;
      continue;
    }
    out += char;
  }
  return out;
}

// Whitespace-collapsing HTML minifier. Runs of whitespace between tags and
// between attributes become a single space (quoted values and text content are
// preserved). The text content of script/pre/textarea elements is kept
// byte-for-byte untouched; style content is collapsed as CSS. Comments are left
// in place.
function minifyHtml(html: string): string {
  const preserved = new Set(["script", "style", "pre", "textarea"]);
  let result = "";
  let position = 0;
  while (position < html.length) {
    if (html.startsWith("<!--", position)) {
      const end = html.indexOf("-->", position + 4);
      position = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html[position] === "<") {
      const end = html.indexOf(">", position);
      if (end === -1) {
        result += html.slice(position);
        break;
      }
      const tag = html.slice(position, end + 1);
      const name = (/^<\s*([a-zA-Z0-9]+)/.exec(tag) || [])[1]?.toLowerCase();
      result += collapseTagWhitespace(tag);
      position = end + 1;
      if (name && preserved.has(name)) {
        const closing = html.indexOf(`</${name}`, position);
        if (closing === -1) {
          result += html.slice(position);
          break;
        }
        result += name === "style" ? collapseCssWhitespace(html.slice(position, closing)) : html.slice(position, closing);
        position = closing;
      }
      continue;
    }
    const next = html.indexOf("<", position);
    const text = html.slice(position, next === -1 ? html.length : next);
    result += text.replace(/[ \t\r\n]+/g, " ");
    position = next === -1 ? html.length : next;
  }
  return result;
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

/** Runs `fn` over `items` with at most `limit` concurrent workers. A failure stops scheduling. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  async function worker() {
    while (!failed && next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await fn(items[index]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function replaceMarkedSection(template: string, content: string): string {
  const start = template.indexOf(SEO_START);
  const end = template.indexOf(SEO_END, start);
  if (start === -1 || end === -1) {
    throw new Error(`SEO markers are missing from the template`);
  }

  return `${template.slice(0, start)}${SEO_START}\n${content}\n\t${template.slice(end)}`;
}

function productHtml(
  template: string,
  schema: string[],
  product: ProductRecord,
  ogImageKey: string | null
): { html: string; id: string } {
  const fields = Object.fromEntries(schema.map((column, index) => [column, product.values[index]]));
  const id = asText(fields.Numero);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Invalid product id: ${id || "(empty)"}`);

  const name = asText(fields.Nimi) || `Tuote ${id}`;
  const manufacturer = asText(fields.Valmistaja);
  const type = asText(fields.Tyyppi);
  const subtype = asText(fields.Alatyyppi);
  const descriptionValue = asText(fields.Luonnehdinta);
  const description = `Katso ${name} -tuotteen tiedot, hinnat ja vastaavat tuotteet Alkometriikasta.`;
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
    description: descriptionValue || description,
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

  const metadata = [
    `\t<meta name="description" content="${escapeHtml(description)}" />`,
    `\t<meta name="keywords" content="${escapeHtml(keywords)}" />`,
    `\t<link rel="canonical" href="${escapeHtml(url)}" />`,
    `\t<meta property="og:type" content="product" />`,
    `\t<meta property="og:title" content="${escapeHtml(title)}" />`,
    `\t<meta property="og:url" content="${escapeHtml(url)}" />`,
    `\t<meta property="og:description" content="${escapeHtml(description)}" />`,
    `\t<meta property="og:site_name" content="Alkometriikka" />`,
    `\t<meta property="og:image" content="${escapeHtml(ogImage)}" />`,
    `\t<meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />`,
    `\t<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />`,
    `\t<meta property="og:image:alt" content="${escapeHtml(name)}" />`,
    `\t<meta name="twitter:card" content="summary_large_image" />`,
    `\t<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `\t<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `\t<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`,
    `\t<script type="application/ld+json">${escapeJson(jsonLd)}</script>`
  ].join("\n");

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

  const fallback = `
\t<article data-prerendered-product style="max-width:80rem;margin:0 auto;padding:2rem;font-family:sans-serif">
\t\t<nav><a href="/">Alkometriikka</a></nav>
\t\t<header>
\t\t\t<h1>${escapeHtml(name)}</h1>
\t\t\t${manufacturer ? `<p>${escapeHtml(manufacturer)}</p>` : ""}
\t\t</header>
\t\t<img src="${escapeHtml(image)}" alt="${escapeHtml(name)}" width="320" height="384" />
\t\t${descriptionValue ? `<p>${escapeHtml(descriptionValue)}</p>` : ""}
\t\t<dl>${facts.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>
\t</article>
\t<script>document.querySelector('[data-prerendered-product]')?.remove();document.currentScript?.remove();</script>`;

  let html = replaceMarkedSection(template, metadata);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/(<body(?:\s[^>]*)?>)/, `$1${fallback}`);
  return { html: minifyHtml(html), id };
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
    Bun.file(options.dataPath).json() as Promise<Dataset>,
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

  let count = 0;
  let skipped = 0;
  const concurrency = Number(process.env.ALKO_PRERENDER_CONCURRENCY) || 32;
  await mapPool(Object.entries(products), concurrency, async ([productId, product]) => {
    if (!product || !Array.isArray(product.values)) return;
    const ogKey = ogManifest[productId] ?? null;
    const key = productKey(schema, product, templateFingerprint, ogKey);
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
    const rendered = productHtml(template, schema, product, ogKey);
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

  console.log(
    `Product pages: ${Object.keys(sortedManifest).length.toLocaleString("en-US")} total, ` +
      `${count.toLocaleString("en-US")} regenerated, ${skipped.toLocaleString("en-US")} unchanged | ` +
      `manifest → ${options.manifestPath}`
  );
}

await main();
