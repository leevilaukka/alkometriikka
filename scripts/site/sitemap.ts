import Bun from "bun";
import { MigratedData, StoreData } from "../data/types";
import { DEV } from "../data/constants";
import { buildCategoryTree, categorySlug, CATEGORY_BASE_PATH } from "../../src/lib/utils/categories.ts";

type SitemapEntry = {
    loc: string;
    lastMod?: string;
    imageLoc?: string;
    priority?: number;
    changeFreq?: "daily" | "weekly" | "never";
};

type StoreList = {
    stores: Record<string, StoreData>;
};

async function main() {
    const productFile = Bun.file(DEV ? "./static/data.json" : "./data.json");
    const availabilityFile = Bun.file(DEV ? "./static/availability.json" : "./availability.json");
    const sitemapEntries: SitemapEntry[] = [];
    const { schema, products } = await productFile.json() as MigratedData;
    const { stores } = await availabilityFile.json() as StoreList;

    if (products === undefined) {
        console.error("No products found in the data file.");
        return;
    }
    for (const product of Object.keys(products).map((k) => products[k])) {
        if (!product || !Array.isArray(product.values)) continue;
        const priceHistory = product.priceHistory ?? [];
        sitemapEntries.push({
            loc: `/tuotteet/${product.values[0]}/`,
            lastMod: priceHistory.length > 0
                ? priceHistory[priceHistory.length - 1].date
                : new Date().toISOString().split('T')[0],
            imageLoc: generateImageLoc(product.values[0] as string),
            priority: 0.7,
        });
    }

    const typeIndex = schema.indexOf("Tyyppi");
    const subTypeIndex = schema.indexOf("Alatyyppi");
    const categoryTree = buildCategoryTree(
        Object.values(products)
            .filter((product) => product && Array.isArray(product.values))
            .map((product) => ({
                type: product.values[typeIndex],
                subType: product.values[subTypeIndex],
                removed: Boolean(product.meta?.removedFromSelection)
            }))
    );

    // A category page changes when one of its products changes price or a new one appears,
    // so its lastmod is the newest price-history date among its current products
    const categoryLastMod = new Map<string, string>();
    const bumpLastMod = (key: string, date: string) => {
        if (date > (categoryLastMod.get(key) ?? "")) categoryLastMod.set(key, date);
    };
    for (const product of Object.values(products)) {
        if (!product || !Array.isArray(product.values) || product.meta?.removedFromSelection) continue;
        const date = product.priceHistory?.at(-1)?.date;
        if (!date) continue;
        const typeSlug = categorySlug(String(product.values[typeIndex] ?? ""));
        const subTypeSlug = categorySlug(String(product.values[subTypeIndex] ?? ""));
        bumpLastMod("", date);
        bumpLastMod(typeSlug, date);
        bumpLastMod(`${typeSlug}/${subTypeSlug}`, date);
    }

    sitemapEntries.push({
        loc: `${CATEGORY_BASE_PATH}/`,
        lastMod: categoryLastMod.get(""),
        priority: 0.7,
        changeFreq: "weekly"
    });
    // Lists recent price changes across the selection, so it changes with the newest one
    sitemapEntries.push({ loc: "/hinnanmuutokset", lastMod: categoryLastMod.get(""), priority: 0.6, changeFreq: "daily" });
    for (const type of categoryTree) {
        sitemapEntries.push({ loc: type.path, lastMod: categoryLastMod.get(type.slug), priority: 0.8, changeFreq: "daily" });
        for (const subType of type.children) {
            sitemapEntries.push({
                loc: subType.path,
                lastMod: categoryLastMod.get(`${type.slug}/${subType.slug}`),
                priority: 0.8,
                changeFreq: "daily"
            });
        }
    }

    for (const store of Object.keys(stores)) {
        if (!store || typeof store !== "string") continue;
        sitemapEntries.push({
            loc: `/myymalat/${store}/`,
            lastMod: new Date().toISOString().split('T')[0],
            priority: 0.5,
            changeFreq: "weekly",
        });
    }

    Bun.write("sitemap.xml", generateSitemapXML(sitemapEntries));
}


function generateSitemapXML(entries: SitemapEntry[]) {
    const header = 
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
        `  <url>\n` +
        `    <loc>https://alkometriikka.fi/</loc>\n` +
        `    <priority>1.0</priority>\n` +
        `    <changefreq>daily</changefreq>\n` +
        `  </url>\n` +
        `  <url>\n` +
        `    <loc>https://alkometriikka.fi/daily/</loc>\n` +
        `    <priority>0.7</priority>\n` +
        `    <changefreq>daily</changefreq>\n` +
        `  </url>\n` +
        `  <url>\n` +
        `    <loc>https://alkometriikka.fi/daily/arkisto/</loc>\n` +
        `    <priority>0.6</priority>\n` +
        `    <changefreq>daily</changefreq>\n` +
        `  </url>\n` +
        `  <url>\n` +
        `    <loc>https://alkometriikka.fi/listat/</loc>\n` +
        `    <priority>0.6</priority>\n` +
        `    <changefreq>never</changefreq>\n` +
        `  </url>\n` +
        `  <url>\n` +
        `    <loc>https://alkometriikka.fi/tilastot/</loc>\n` +
        `    <priority>0.6</priority>\n` +
        `    <changefreq>weekly</changefreq>\n` +
        `  </url>\n` +
        `  <url>\n` +
        `    <loc>https://alkometriikka.fi/laskin/</loc>\n` +
        `    <priority>0.6</priority>\n` +
        `    <changefreq>weekly</changefreq>\n` +
        `  </url>\n` +
        `  <url>\n` +
        `    <loc>https://alkometriikka.fi/myymalat/</loc>\n` +
        `    <priority>0.6</priority>\n` +
        `    <changefreq>monthly</changefreq>\n` +
        `  </url>\n`;
    
    const body = entries.map((entry) => {
        const encodedLoc = encodeURI(entry.loc);
        return `  <url>\n` +
            `    <loc>https://alkometriikka.fi${encodedLoc}</loc>\n` +
            `    <priority>${entry.priority ?? 0.6}</priority>\n` +
            `    <changefreq>${entry.changeFreq ?? "weekly"}</changefreq>\n` +
            (entry.lastMod ? `    <lastmod>${entry.lastMod}</lastmod>\n` : '') +
            (entry.imageLoc ?
                `    <image:image>\n` +
                `      <image:loc>${entry.imageLoc}</image:loc>\n` +
                `    </image:image>\n` : '') +
            `  </url>\n`;
    }).join("");

    const footer = `</urlset>`;

    return header + body + footer;
}

await main();

export { };

function generateImageLoc(productID: string): string {
    const imageURL = `https://images.alko.fi/images/cs_srgb,f_auto,t_products/cdn` as const;

    return `${imageURL}/${productID}/kuva.jpg` as const;
}
