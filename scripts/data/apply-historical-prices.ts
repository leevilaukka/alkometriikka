import { applyHistoricalPrices } from './historical-prices';
import { withDatasetIndex } from './dataset-index';
import type { MigratedData } from './types';

const path = process.argv.includes('--dev') ? './static/data.json' : './data.json';
const dataset: MigratedData = await Bun.file(path).json();
await applyHistoricalPrices(dataset, path.replace('data.json', 'history-preview.json'));
await Bun.write(path, JSON.stringify(withDatasetIndex(dataset)));
console.log(`Historical prices merged into ${path}`);
