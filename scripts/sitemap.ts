import Bun from "bun";
import { MigratedData } from "./setup/types";
const DEV = process.argv.includes("--dev");

async function main() {
    const file = Bun.file(DEV ? "./static/data.json" : "./data.json");
    const sitemapEntries: { loc: string; lastMod: string, imageLoc: string }[] = [];
    const { products } = await file.json() as MigratedData;

    if (products === undefined) {
        console.error("No products found in the data file.");
        return;
    }
    for (const product of Object.keys(products).map((k) => products[k])) {
        if (!product || !Array.isArray(product.values)) continue;
        const priceHistory = product.priceHistory ?? [];
        sitemapEntries.push({
            loc: `/tuotteet/${product.values[0]}`,
            lastMod: priceHistory.length > 0
                ? priceHistory[priceHistory.length - 1].date
                : new Date().toISOString().split('T')[0],
            imageLoc: generateImageLoc(product.values[0] as string)
        });
    }
    Bun.write("sitemap.xml", generateSitemapXML(sitemapEntries));
}


function generateSitemapXML(entries: { loc: string; lastMod: string, imageLoc: string }[]) {
    const header = `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
        `  <url>\n` +
        `    <loc>https://alkometriikka.fi/</loc>\n` +
        `    <priority>1.0</priority>\n` +
        `    <changefreq>daily</changefreq>\n` +
        `  </url>\n` +
        `  <url>\n` +
        `    <loc>https://alkometriikka.fi/listat</loc>\n` +
        `    <priority>0.8</priority>\n` +
        `    <changefreq>never</changefreq>\n` +
        `  </url>\n`;
    const footer = `</urlset>`;

    const body = entries.map((entry) => {
        const encodedLoc = encodeURI( entry.loc );
        return `  <url>\n` +
            `    <loc>https://alkometriikka.fi${encodedLoc}</loc>\n` +
            `    <priority>0.6</priority>\n` +
            `    <changefreq>weekly</changefreq>\n` +
            `    <lastmod>${entry.lastMod}</lastmod>\n` +
            `    <image:image>\n` +
            `      <image:loc>${entry.imageLoc}</image:loc>\n` +
            `    </image:image>\n` +
            `  </url>\n`;
    }).join("");

    return header + body + footer;
}

await main();

export {};

function generateImageLoc(productID: string): string {
    const imageURL =`https://images.alko.fi/images/cs_srgb,f_auto,t_products/cdn` as const;
    
    return `${imageURL}/${productID}/kuva.jpg` as const;
}
