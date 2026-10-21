import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import type { StoredDataset } from '../../src/lib/utils/catalog/dataset';
import type { HistoryPreviewReport } from '../../src/lib/utils/catalog/historyPreview';

const bundle = new URL('../../data/history-preview/', import.meta.url);

/** Read only verified archive assets; the captured current prices are never restored. */
export async function readHistoricalPrices() {
	const manifest = JSON.parse(await readFile(new URL('manifest.json', bundle), 'utf8'));
	async function asset<T>(name: string): Promise<T> {
		const entry = manifest.files.find((file: { file: string }) => file.file === name);
		if (!entry || entry.gzip !== `${name}.gz`) throw new Error(`Missing history asset: ${name}`);
		const bytes = gunzipSync(await readFile(new URL(entry.gzip, bundle)));
		if (
			bytes.length !== entry.bytes ||
			createHash('sha256').update(bytes).digest('hex') !== entry.sha256
		)
			throw new Error(`History asset verification failed: ${name}`);
		return JSON.parse(bytes.toString('utf8'));
	}
	return {
		dataset: await asset<StoredDataset>('data.json'),
		report: await asset<HistoryPreviewReport>('history-preview.json')
	};
}

function name(value: unknown) {
	return (
		String(value ?? '')
			.normalize('NFKD')
			.replace(/\p{M}/gu, '')
			.toLowerCase()
			.replace(/\b(?:19|20)\d{2}\b/g, ' ')
			.match(/[\p{L}\p{N}_]+/gu)
			?.join(' ') ?? ''
	);
}
function volume(value: unknown) {
	return Number(
		String(value ?? '')
			.trim()
			.replace(/\s*l\s*$/i, '')
			.replace(',', '.')
	);
}

/** Rebuild the archive layer against today's identities, keeping all live observations. */
export function mergeHistoricalPrices(
	current: StoredDataset,
	archive: StoredDataset,
	evidence: HistoryPreviewReport
) {
	const schema = current.schema as string[];
	const oldSchema = archive.schema as string[];
	const report = structuredClone(evidence);
	const summaries = new Map(evidence.products.map((product) => [product.id, product]));
	report.products = [];
	let points = 0;
	for (const [id, product] of Object.entries(current.products ?? {})) {
		const live = (product.priceHistory ?? []).filter((point) => !point.archive);
		product.priceHistory = live;
		const historical = archive.products?.[id];
		if (
			!historical ||
			!name(product.values[schema.indexOf('Nimi')]) ||
			!(volume(product.values[schema.indexOf('Pullokoko')]) > 0) ||
			name(product.values[schema.indexOf('Nimi')]) !==
				name(historical.values[oldSchema.indexOf('Nimi')]) ||
			volume(product.values[schema.indexOf('Pullokoko')]) !==
				volume(historical.values[oldSchema.indexOf('Pullokoko')])
		)
			continue;
		const firstLive =
			live.map((point) => point.date).sort()[0] ?? current.metadata?.LastSynced?.slice(0, 10);
		// The archive cannot establish a price inside the continuously recorded live era.
		const accepted = (historical.priceHistory ?? []).filter(
			(point) => point.archive && firstLive && point.archive.lastObserved < firstLive
		);
		product.priceHistory = [...live, ...structuredClone(accepted)].sort((a, b) =>
			a.date.localeCompare(b.date)
		);
		if (!accepted.length) continue;
		points += accepted.length;
		const summary = summaries.get(id);
		if (summary)
			report.products.push({
				...summary,
				name: String(product.values[schema.indexOf('Nimi')]),
				price: Number(String(product.values[schema.indexOf('Hinta')]).replace(',', '.')),
				removed: Boolean(product.meta?.removedFromSelection),
				archivePoints: accepted.length,
				firstDate: accepted[0].date,
				lastDate: accepted.at(-1)!.archive!.lastObserved,
				observations: accepted.reduce((sum, point) => sum + point.archive!.observations, 0)
			});
	}
	report.baseLastSynced = current.metadata?.LastSynced ?? '';
	report.statistics.products = report.products.length;
	report.statistics.archivePoints = points;
	report.statistics.acceptedObservations = report.products.reduce(
		(sum, product) => sum + product.observations,
		0
	);
	current.metadata ??= {};
	current.metadata.historyPreview = {
		version: report.version,
		reportUrl: '/history-preview.json',
		products: report.products.length,
		firstDate: report.firstDate,
		lastDate: report.lastDate
	};
	return report;
}

export async function applyHistoricalPrices(dataset: StoredDataset, reportPath: string) {
	const archive = await readHistoricalPrices();
	const report = mergeHistoricalPrices(dataset, archive.dataset, archive.report);
	await Bun.write(reportPath, JSON.stringify(report));
}
