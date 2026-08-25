import type {
	ExtractedDocument,
	ParsedRegion,
	ParsedVintageDocument,
	TextItem,
	WineType
} from './types.ts';

/** Matches a plausible vintage year used as a row label (e.g. "1976", "2020"). */
const YEAR_RE = /^(1[5-9]\d{2}|20\d{2})$/;

interface Column {
	center: number;
	/** Tier labels matched for this column, outermost (e.g. country) first, innermost (e.g. area) last. */
	labels: string[];
}

export interface ParseOptions {
	source: string;
	title?: string;
	wineType: WineType;
}

/**
 * Parses the specific layout used by Alko's Excel-exported vintage-rating PDFs (this module only
 * targets that one layout - additional Alko PDF shapes should get their own parser module rather
 * than branching this one):
 *
 *   - One row per vintage year, leftmost cell is the year.
 *   - One or more header rows above the data rows name the columns (regions). A higher-tier
 *     header row may group several columns under a broader name (e.g. a country).
 *   - Columns are identified purely from text position (x/y), never from fixed coordinates, so
 *     the same logic keeps working if Alko re-exports the sheet with different column widths.
 */
export function parseVintageDocument(
	extracted: ExtractedDocument,
	options: ParseOptions
): ParsedVintageDocument {
	const rows = extracted.pages.flatMap((page) => groupIntoRows(page.items));

	const firstDataRowIndex = rows.findIndex((row) => row.length > 0 && YEAR_RE.test(row[0].text));
	if (firstDataRowIndex === -1) {
		throw new Error(
			'Could not find any year-labelled row in the extracted PDF text; the document may not ' +
				'be a vintage-rating table, or text extraction failed.'
		);
	}

	const headerRows = rows.slice(0, firstDataRowIndex).filter((row) => row.length > 0);
	if (headerRows.length === 0) {
		throw new Error('No header row(s) found above the first data row; cannot name the regions.');
	}

	const dataRows = rows
		.slice(firstDataRowIndex)
		.filter((row) => row.length > 0 && YEAR_RE.test(row[0].text));

	const columns = buildColumns(headerRows, dataRows);
	if (columns.length < 2) {
		throw new Error(`Expected at least 2 region columns, found ${columns.length}.`);
	}

	const maxAssignDistance = maxColumnAssignDistance(columns);
	const ratingsByColumn = new Map<Column, Map<string, number>>(columns.map((c) => [c, new Map()]));

	for (const row of dataRows) {
		const [yearItem, ...cells] = row;
		const year = yearItem.text;

		for (const cell of cells) {
			const score = parseIntegerCell(cell, year);
			const column = nearestColumn(cell, columns, maxAssignDistance);
			const ratings = ratingsByColumn.get(column)!;
			if (ratings.has(year)) {
				throw new Error(
					`Duplicate rating detected for region "${columnName(column)}" and year ${year}.`
				);
			}
			ratings.set(year, score);
		}
	}

	const regions: ParsedRegion[] = columns.map((column) => {
		const country = column.labels.length >= 2 ? column.labels[0] : null;
		const area = column.labels[column.labels.length - 1];
		return {
			country,
			area,
			name: columnName(column),
			ratings: Object.fromEntries(ratingsByColumn.get(column)!)
		};
	});

	return {
		source: options.source,
		title: options.title ?? '',
		wineType: options.wineType,
		extractedAt: new Date().toISOString(),
		regions
	};
}

function columnName(column: Column): string {
	return column.labels.join(' – ');
}

/** Groups a page's text items into visual rows using each item's vertical position. */
function groupIntoRows(items: TextItem[]): TextItem[][] {
	if (items.length === 0) return [];

	const heights = items.map((i) => i.height).filter((h) => h > 0);
	const tolerance = Math.max(2, median(heights) * 0.6);

	const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
	const rows: TextItem[][] = [];

	for (const item of sorted) {
		const currentRow = rows[rows.length - 1];
		if (currentRow && Math.abs(item.y - currentRow[0].y) <= tolerance) {
			currentRow.push(item);
		} else {
			rows.push([item]);
		}
	}

	for (const row of rows) row.sort((a, b) => a.x - b.x);
	return rows;
}

/**
 * Builds one column per distinct x-position actually used by data cells (not by header cells -
 * some regions are a single unsubdivided country/area and never get their own leaf header, e.g.
 * "Portugali" next to Spain's named sub-regions, so header structure alone can't be trusted to
 * enumerate every column).
 *
 * Each column is then labelled by walking the header rows that look like real grouping tiers
 * (more than one item - a single item spanning the width is treated as a document title/caption,
 * not a tier) from outermost to innermost. Within a tier, a column is matched to the closest
 * preceding item *that belongs to the same parent group* - group labels are typically left-aligned
 * over their merged cell, so a column belongs to the last tier item at or before its own position.
 * Restricting candidates to the current parent group's range (narrowed tier by tier) keeps e.g. an
 * Austrian region from being mis-matched to a German group header sitting further left.
 */
function buildColumns(headerRows: TextItem[][], dataRows: TextItem[][]): Column[] {
	const dataCells = dataRows.flatMap((row) => row.slice(1));
	if (dataCells.length === 0) {
		throw new Error('No data cells found below the header rows.');
	}

	const columns: Column[] = clusterCenters(dataCells).map((center) => ({ center, labels: [] }));
	const ranges = columns.map(() => ({ lo: -Infinity, hi: Infinity }));

	const tiers = headerRows.filter((row) => row.length > 1);
	for (const tier of tiers) {
		const items = [...tier].sort((a, b) => a.x - b.x);

		columns.forEach((column, index) => {
			const range = ranges[index];
			const candidates = items.filter((item) => item.x >= range.lo && item.x < range.hi);

			let boundary: TextItem | undefined;
			let boundaryIndex = -1;
			for (let i = 0; i < candidates.length; i++) {
				if (candidates[i].x <= column.center) {
					boundary = candidates[i];
					boundaryIndex = i;
				}
			}
			if (!boundary) return;

			const label = boundary.text.trim();
			const previous = column.labels[column.labels.length - 1];
			if (!previous || previous.toLowerCase() !== label.toLowerCase()) {
				column.labels.push(label);
			}

			range.lo = boundary.x;
			range.hi = boundaryIndex + 1 < candidates.length ? candidates[boundaryIndex + 1].x : range.hi;
		});
	}

	for (const column of columns) {
		if (column.labels.length === 0) {
			throw new Error(
				`Could not determine a region name for a data column near x=${column.center.toFixed(1)}.`
			);
		}
	}

	return columns;
}

/** Clusters data-cell x-centers into columns, tolerating a few points of row-to-row jitter. */
function clusterCenters(cells: TextItem[]): number[] {
	const widths = cells.map((c) => c.width).filter((w) => w > 0);
	const tolerance = Math.max(6, median(widths) * 1.3);

	const centers = cells.map((c) => c.x + c.width / 2).sort((a, b) => a - b);
	const clusters: number[][] = [];

	for (const value of centers) {
		const cluster = clusters[clusters.length - 1];
		if (cluster && value - cluster[cluster.length - 1] <= tolerance) {
			cluster.push(value);
		} else {
			clusters.push([value]);
		}
	}

	return clusters.map((cluster) => cluster.reduce((sum, v) => sum + v, 0) / cluster.length);
}

/** Smallest gap between adjacent column centers, halved, used as the max distance for assigning a value to a column. */
function maxColumnAssignDistance(columns: Column[]): number {
	const centers = columns.map((c) => c.center).sort((a, b) => a - b);
	let minGap = Infinity;
	for (let i = 1; i < centers.length; i++) {
		minGap = Math.min(minGap, centers[i] - centers[i - 1]);
	}
	return Number.isFinite(minGap) ? minGap / 2 : 20;
}

function nearestColumn(cell: TextItem, columns: Column[], maxDistance: number): Column {
	const cellCenter = cell.x + cell.width / 2;
	let best: Column | undefined;
	let bestDistance = Infinity;

	for (const column of columns) {
		const distance = Math.abs(cellCenter - column.center);
		if (distance < bestDistance) {
			best = column;
			bestDistance = distance;
		}
	}

	if (!best || bestDistance > maxDistance) {
		throw new Error(
			`Could not confidently map value "${cell.text}" (page ${cell.page}, x=${cell.x.toFixed(1)}) ` +
				`to a region column (closest was ${bestDistance.toFixed(1)}pt away, allowed ${maxDistance.toFixed(1)}pt). ` +
				'The PDF layout may not match the expected vintage-rating table shape.'
		);
	}

	return best;
}

function parseIntegerCell(cell: TextItem, year: string): number {
	const score = Number.parseInt(cell.text, 10);
	if (!Number.isInteger(score) || String(score) !== cell.text) {
		throw new Error(
			`Expected an integer score for year ${year} but found "${cell.text}" (page ${cell.page}).`
		);
	}
	return score;
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
