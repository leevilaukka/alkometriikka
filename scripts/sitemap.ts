const DEV = process.argv.includes("--dev");

async function main() {
    const file = Bun.file(DEV ? "./static/data.json" : "./data.json");
    const sitemapEntries: { loc: string; lastMod: string }[] = [];
    const parsed = await file.json() as { table: any[][], metadata: any };
    const data = parsed.table.slice(1);

    const indexOfTypeColumn = parsed.table[0].indexOf("Tyyppi");
    const indexOfHistoryColumn = parsed.table[0].indexOf("Hintahistoria");

    for (const product of data) {
        if(product[indexOfTypeColumn] === "lahja- ja juomatarvikkeet") continue; // Skip gift and drink accessories
        sitemapEntries.push({
            loc: `/tuotteet/${product[0]}`,
            lastMod: product[indexOfHistoryColumn] && product[indexOfHistoryColumn].length > 0
                ? product[indexOfHistoryColumn][product[indexOfHistoryColumn].length - 1].date
                : new Date().toISOString().split('T')[0] 
        });
    }
    Bun.write("sitemap.xml", generateSitemapXML(sitemapEntries));
}


function generateSitemapXML(entries: { loc: string; lastMod: string }[]) {
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
        const encodedLoc = encodeURI( entry.loc );
        return `  <url>\n` +
            `    <loc>https://alkometriikka.fi${encodedLoc}</loc>\n` +
            `    <priority>0.5</priority>\n` +
            `    <changefreq>weekly</changefreq>\n` +
            `    <lastmod>${entry.lastMod}</lastmod>\n` +
            `  </url>\n`;
    }).join("");

    return header + body + footer;
}

await main();

export {};