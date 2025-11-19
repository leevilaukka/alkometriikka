const DEV = process.argv.includes("--dev");

async function main() {
    const file = Bun.file(DEV ? "./static/data.json" : "./data.json");
    const sitemapEntries: string[] = [];
    const parsed = await file.json() as { table: any[][], metadata: any };
    const data = parsed.table.slice(1);

    for (const product of data) {
        sitemapEntries.push(`/tuotteet/${product[0]}`);
    }
    Bun.write("static/sitemap.xml", generateSitemapXML(sitemapEntries));
}


function generateSitemapXML(entries: string[]) {
    const header = `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `  <url>\n` +
        `    <loc>https://alkometriikka.fi/</loc>\n` +
        `    <priority>1.0</priority>\n` +
        `    <changefreq>daily</changefreq>\n` +
        `  </url>\n` +
        `  <url>\n` +
        `    <loc>https://alkometriikka.fi/listat</loc>\n` +
        `    <priority>0.8</priority>\n` +
        `  </url>\n`;
    const footer = `</urlset>`;

    const body = entries.map((entry) => {
        return `  <url>\n` +
            `    <loc>https://alkometriikka${entry}</loc>\n` +
            `    <priority>0.5</priority>\n` +
            `    <changefreq>weekly</changefreq>\n` +
            `  </url>\n`;
    }).join("");

    return header + body + footer;
}

await main();

export {};