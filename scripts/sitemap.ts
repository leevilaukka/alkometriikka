import Bun from "bun";
import { MigratedData } from "./setup/types";
import { DEV } from "./setup/constants";

type SitemapEntry = {
    loc: string;
    lastMod?: string;
    imageLoc?: string;
    priority?: number;
    changeFreq?: "daily" | "weekly" | "never";
};

type StoreList = {
    stores: Record<string, any>;
};

async function main() {
    const productFile = Bun.file(DEV ? "./static/data.json" : "./data.json");
    const availabilityFile = Bun.file(DEV ? "./static/availability.json" : "./availability.json");
    const sitemapEntries: SitemapEntry[] = [];
    const { products } = await productFile.json() as MigratedData;
    const { stores } = await availabilityFile.json() as { stores: Record<string, any> };

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
    const header = `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
        `  <url>\n` +
        `    <loc>https://alkometriikka.fi/</loc>\n` +
        `    <priority>1.0</priority>\n` +
        `    <changefreq>daily</changefreq>\n` +
        `  </url>\n` +
        `  <url>\n` +
        `    <loc>https://alkometriikka.fi/listat/</loc>\n` +
        `    <priority>0.8</priority>\n` +
        `    <changefreq>never</changefreq>\n` +
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
