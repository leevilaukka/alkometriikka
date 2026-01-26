const DEV = process.argv.includes("--dev");

export const priceHistory = (table: any[]) => {
    const priceHistoryMap: Record<string, { date: string; price: number }[]> = {};

    const today = new Date().toISOString().split('T')[0];

    for (const row of table) {
        const productId = row[0]; // Assuming first column is product ID
        const price = row[4]; // Assuming fifth column is price

        if (!priceHistoryMap[productId]) {
            priceHistoryMap[productId] = [];
        }

        const history = priceHistoryMap[productId];
        const lastEntry = history[history.length - 1];

        if (!lastEntry || lastEntry.price !== price) {
            history.push({ date: today, price });
        }
    }

    const historyJson = JSON.stringify(priceHistoryMap);
    Bun.write(DEV ? "./static/pricehistory.json" : "./pricehistory.json", historyJson);
}