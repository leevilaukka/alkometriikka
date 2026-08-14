import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

type ProductRecord = {
  values: unknown[];
  meta?: {
    removedFromSelection?: string;
  };
};

type Dataset = {
  schema?: unknown;
  products?: Record<string, ProductRecord>;
};

type Options = {
  dataPath: string;
  outputPath: string;
  templatePath: string;
};

const SITE_URL = "https://alkometriikka.fi";
const SEO_START = "<!-- Dynamic SEO data start -->";
const SEO_END = "<!-- Dynamic SEO data end -->";

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function resolveOptions(): Options {
  const outputPath = path.resolve(readOption("--out") ?? "build");
  return {
    dataPath: path.resolve(readOption("--data") ?? path.join(outputPath, "data.json")),
    outputPath,
    templatePath: path.resolve(readOption("--template") ?? path.join(outputPath, "404.html"))
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

function parsePrice(value: unknown, productId: string): number {
  const price = typeof value === "number" ? value : Number(asText(value).replace(",", "."));
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid price for product ${productId}: ${asText(value) || "(empty)"}`);
  }
  return price;
}

function replaceMarkedSection(template: string, content: string): string {
  const start = template.indexOf(SEO_START);
  const end = template.indexOf(SEO_END, start);
  if (start === -1 || end === -1) {
    throw new Error(`SEO markers are missing from the template`);
  }

  return `${template.slice(0, start)}${SEO_START}\n${content}\n\t${template.slice(end)}`;
}

function productHtml(template: string, schema: string[], product: ProductRecord): { html: string; id: string } {
  const fields = Object.fromEntries(schema.map((column, index) => [column, product.values[index]]));
  const id = asText(fields.Numero);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Invalid product id: ${id || "(empty)"}`);

  const name = asText(fields.Nimi) || `Tuote ${id}`;
  const manufacturer = asText(fields.Valmistaja);
  const type = asText(fields.Tyyppi);
  const subtype = asText(fields.Alatyyppi);
  const descriptionValue = asText(fields.Luonnehdinta);
  const description = `Katso ${name} -tuotteen tiedot, hinnat ja vastaavat tuotteet Alkometriikasta.`;
  const title = `${name} | Alkometriikka`;
  const url = `${SITE_URL}/tuotteet/${encodeURIComponent(id)}/`;
  const image = `https://images.alko.fi/images/cs_srgb,f_auto,t_products/cdn/${encodeURIComponent(id)}/kuva.jpg`;
  const price = parsePrice(fields.Hinta, id);
  const keywords = [name, manufacturer, type, subtype, descriptionValue].filter(Boolean).join(", ");
  const category = [type, subtype].filter(Boolean).join(" / ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    sku: id,
    url,
    image,
    description: descriptionValue || description,
    ...(manufacturer ? { brand: { "@type": "Brand", name: manufacturer } } : {}),
    ...(category ? { category } : {}),
    offers: {
      "@type": "Offer",
      url,
      price,
      priceCurrency: "EUR",
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
    `\t<meta property="og:image" content="${escapeHtml(image)}" />`,
    `\t<meta property="og:image:alt" content="${escapeHtml(name)}" />`,
    `\t<meta name="twitter:card" content="summary_large_image" />`,
    `\t<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `\t<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `\t<meta name="twitter:image" content="${escapeHtml(image)}" />`,
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
  return { html, id };
}

async function main() {
  const options = resolveOptions();
  const [dataset, template] = await Promise.all([
    Bun.file(options.dataPath).json() as Promise<Dataset>,
    Bun.file(options.templatePath).text()
  ]);

  if (!Array.isArray(dataset.schema) || !dataset.schema.every((column) => typeof column === "string")) {
    throw new Error(`Invalid schema in ${options.dataPath}`);
  }
  if (!dataset.products || typeof dataset.products !== "object") {
    throw new Error(`No products found in ${options.dataPath}`);
  }

  const productsPath = path.join(options.outputPath, "tuotteet");
  await rm(productsPath, { recursive: true, force: true });

  let count = 0;
  const generatedIds = new Set<string>();
  for (const product of Object.values(dataset.products)) {
    if (!product || !Array.isArray(product.values)) continue;
    const rendered = productHtml(template, dataset.schema, product);
    if (generatedIds.has(rendered.id)) throw new Error(`Duplicate product id: ${rendered.id}`);
    generatedIds.add(rendered.id);
    const directory = path.join(productsPath, rendered.id);
    await mkdir(directory, { recursive: true });
    await Bun.write(path.join(directory, "index.html"), rendered.html);
    count += 1;
  }

  if (count === 0) throw new Error(`No product pages were generated`);
  console.log(`Generated ${count.toLocaleString("en-US")} product pages in ${productsPath}`);
}

await main();
