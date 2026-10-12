import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	isReviewSlug,
	readProductWineReviews,
	reviewVintage,
	VIINILEHTI_ORIGIN,
	wineReviewUrl,
	type WineReview,
	type ProductWineReviews
} from '../../src/lib/utils/wine-reviews.ts';

export type WineIndexEntry = {
	id: string;
	sku: string;
	vintage: string | null;
	title: string;
	slug: string;
	stars: number | null;
};

type IndexCache = {
	version: 1;
	fetchedAt: string;
	entries: WineIndexEntry[];
	failures: Record<string, string>;
};

type Catalog = {
	products?: Record<string, { meta?: { removedFromSelection?: string } }>;
};

export type ReviewSyncOptions = {
	catalog: Catalog;
	outputDir: string;
	limit?: number;
	skus?: Set<string>;
	force?: boolean;
	fetcher?: ReviewFetcher;
	now?: Date;
	delayMs?: number;
	log?: (message: string) => void;
};

export type ReviewFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DAY = 86_400_000;
const INDEX_MAX_AGE = DAY;
const REVIEW_MAX_AGE = 30 * DAY;

function object(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function stars(value: unknown): number | null {
	const result = Number(value);
	return Number.isInteger(result) && result >= 1 && result <= 5 ? result : null;
}

/** Normalize source markup to text. Source strings are never evaluated or rendered as HTML. */
export function reviewText(value: unknown): string {
	if (typeof value !== 'string') return '';
	const entities: Record<string, string> = {
		amp: '&',
		lt: '<',
		gt: '>',
		quot: '"',
		apos: "'",
		nbsp: ' '
	};
	return value
		.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
		.replace(/<br\s*\/?\s*>|<\/p\s*>/gi, '\n')
		.replace(/<[^>]*>/g, '')
		.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, name: string) => {
			if (!name.startsWith('#')) return entities[name.toLowerCase()] ?? entity;
			const code = name.toLowerCase().startsWith('#x')
				? parseInt(name.slice(2), 16)
				: parseInt(name.slice(1), 10);
			return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
				? String.fromCodePoint(code)
				: entity;
		})
		.replace(/\r\n?/g, '\n')
		.replace(/[^\S\n]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** Extract a JSON object by balancing braces outside strings, never by executing the script. */
export function embeddedWineData(html: string): Record<string, unknown> {
	const marker = /console\.log\(\s*(['"])UUSI KANTA:\s*\1\s*,\s*/.exec(html);
	if (!marker) throw new Error('Embedded wine JSON was not found');
	const start = marker.index + marker[0].length;
	if (html[start] !== '{') throw new Error('Invalid embedded wine JSON');
	let depth = 0;
	let quoted = false;
	let escaped = false;
	for (let i = start; i < Math.min(html.length, start + 500_000); i++) {
		const char = html[i];
		if (quoted) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') quoted = false;
		} else if (char === '"') quoted = true;
		else if (char === '{') depth++;
		else if (char === '}' && --depth === 0) return object(JSON.parse(html.slice(start, i + 1)));
	}
	throw new Error('Incomplete embedded wine JSON');
}

export function parseWineReview(
	html: string,
	entry: WineIndexEntry,
	fetchedAt: string
): WineReview {
	const wine = embeddedWineData(html);
	if (String(wine.alkonumber) !== entry.sku || reviewVintage(wine.vintage) !== entry.vintage) {
		throw new Error('Review SKU or vintage differs from the index');
	}
	const review = object(wine.review);
	const text =
		reviewText(wine.full_review) ||
		['impression', 'smell', 'taste', 'general']
			.map((key) => reviewText(review[key]))
			.filter(Boolean)
			.join('\n\n');
	// This bookkeeping flag is false on some publicly indexed, visible reviews.
	// Eligibility comes from the public index and the fetched page instead.
	if (!text) throw new Error('No review text');
	const date =
		typeof review.publish_date === 'string'
			? review.publish_date
			: object(review.publish_date).date;
	const publishedAt =
		typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null;
	return {
		id: entry.id,
		sku: entry.sku,
		vintage: entry.vintage,
		title: reviewText(wine.title) || entry.title,
		slug: entry.slug,
		text,
		food: reviewText(review.food),
		stars: stars(review.stars),
		starDescription: reviewText(review.stars_desc),
		storageDescription: reviewText(review.storage_desc),
		valueDescription: reviewText(review.pricequality_desc),
		publishedAt,
		fetchedAt
	};
}

export function parseWineIndex(value: unknown): WineIndexEntry[] {
	const result = object(value);
	const data = object(result.data);
	if (
		result.success !== true ||
		!Array.isArray(data.posts) ||
		typeof data.total !== 'number' ||
		data.total <= 0 ||
		data.posts.length !== data.total
	) {
		throw new Error('Wine index is empty, invalid, or incomplete');
	}
	const entries = new Map<string, WineIndexEntry>();
	for (const item of data.posts) {
		const post = object(item);
		const sku = String(post.alkonumber ?? '');
		if (!/^\d{6}$/.test(sku) || !isReviewSlug(post.slug) || typeof post.title !== 'string')
			continue;
		const vintage = reviewVintage(post.vintage);
		const id = `${sku}_${vintage ?? '0'}`;
		entries.set(id, {
			id,
			sku,
			vintage,
			title: reviewText(post.title),
			slug: post.slug,
			stars: stars(post.stars)
		});
	}
	if (entries.size === 0) throw new Error('Wine index contains no Alko products');
	return [...entries.values()];
}

async function readJson(file: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(file, 'utf8'));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
		throw error;
	}
}

async function writeJson(file: string, value: unknown): Promise<void> {
	await writeFile(`${file}.tmp`, JSON.stringify(value));
	await rename(`${file}.tmp`, file);
}

function fresh(date: string | undefined, now: number, age: number): boolean {
	const parsed = Date.parse(date ?? '');
	return Number.isFinite(parsed) && parsed <= now && now - parsed < age;
}

export async function syncWineReviews(options: ReviewSyncOptions) {
	const {
		catalog,
		outputDir,
		force = false,
		fetcher = fetch,
		now = new Date(),
		delayMs = 500,
		log = console.log
	} = options;
	const limit = options.limit ?? 200;
	if (!Number.isSafeInteger(limit) || limit < 0)
		throw new Error('Review limit must be a nonnegative integer');
	if (!catalog.products || Object.keys(catalog.products).length === 0)
		throw new Error('Product catalog is empty');
	const activeSkus = new Set(
		Object.entries(catalog.products)
			.filter(
				([sku, product]) =>
					/^\d{6}$/.test(sku) &&
					!product.meta?.removedFromSelection &&
					(!options.skus || options.skus.has(sku))
			)
			.map(([sku]) => sku)
	);
	await mkdir(outputDir, { recursive: true });
	const indexPath = path.join(outputDir, '_index.json');
	const saved = object(await readJson(indexPath));
	let index: IndexCache | undefined;
	if (saved.version === 1 && typeof saved.fetchedAt === 'string' && Array.isArray(saved.entries)) {
		const entries = saved.entries.filter((raw): raw is WineIndexEntry => {
			const entry = object(raw);
			return (
				typeof entry.id === 'string' &&
				/^\d{6}$/.test(String(entry.sku)) &&
				isReviewSlug(entry.slug) &&
				typeof entry.title === 'string' &&
				(entry.vintage === null || reviewVintage(entry.vintage) === entry.vintage)
			);
		});
		if (entries.length === saved.entries.length && entries.length > 0) {
			index = {
				version: 1,
				fetchedAt: saved.fetchedAt,
				entries,
				failures: Object.fromEntries(
					Object.entries(object(saved.failures)).filter(
						(pair): pair is [string, string] => typeof pair[1] === 'string'
					)
				)
			};
		}
	}
	const request = async (url: string) => {
		const response = await fetcher(url, {
			headers: {
				Accept: 'application/json, text/html',
				'User-Agent': 'Alkometriikka/1.0 (+https://alkometriikka.fi)'
			},
			signal: AbortSignal.timeout(20_000)
		});
		if (!response.ok) throw new Error(`Viinilehti returned HTTP ${response.status}`);
		return response;
	};
	if (force || !index || !fresh(index.fetchedAt, now.getTime(), INDEX_MAX_AGE)) {
		try {
			const endpoint = `${VIINILEHTI_ORIGIN}/wp-admin/admin-ajax.php`;
			const nonceResponse = object(await (await request(`${endpoint}?action=sl_nonces`)).json());
			const nonce = object(nonceResponse.data).search;
			if (nonceResponse.success !== true || typeof nonce !== 'string' || !nonce)
				throw new Error('Search nonce is missing');
			const params = new URLSearchParams({
				action: 'sl_wine_search',
				_nonce: nonce,
				q: '',
				selectedTerms: '{}',
				filters: '{}'
			});
			const entries = parseWineIndex(await (await request(`${endpoint}?${params}`)).json());
			index = {
				version: 1,
				fetchedAt: now.toISOString(),
				entries,
				failures: index?.failures ?? {}
			};
			await writeJson(indexPath, index);
			log(`Wine index: ${entries.length} distinct SKU/vintage entries`);
		} catch (error) {
			if (!index) throw error;
			log(`Wine index unavailable; retaining cached reviews: ${String(error)}`);
			return { fetched: 0, failed: 0, pending: 0, indexUnavailable: true };
		}
	}
	const documents = new Map<string, ProductWineReviews>();
	const pending: WineIndexEntry[] = [];
	for (const entry of index.entries) {
		if (!activeSkus.has(entry.sku)) continue;
		let document = documents.get(entry.sku);
		if (!document) {
			document = {
				version: 1,
				sku: entry.sku,
				reviews: readProductWineReviews(
					await readJson(path.join(outputDir, `${entry.sku}.json`)),
					entry.sku
				)
			};
			documents.set(entry.sku, document);
		}
		const cached = document.reviews.find((review) => review.id === entry.id);
		if (!force && fresh(index.failures[entry.id], now.getTime(), DAY)) continue;
		if (
			force ||
			!cached ||
			cached.slug !== entry.slug ||
			cached.stars !== entry.stars ||
			!fresh(cached.fetchedAt, now.getTime(), REVIEW_MAX_AGE)
		)
			pending.push(entry);
	}
	// Populate missing reviews first; refresh the oldest cached reviews afterwards.
	pending.sort((a, b) => {
		const cachedA = documents.get(a.sku)?.reviews.find((review) => review.id === a.id);
		const cachedB = documents.get(b.sku)?.reviews.find((review) => review.id === b.id);
		return (
			(cachedA?.fetchedAt ?? '').localeCompare(cachedB?.fetchedAt ?? '') || a.id.localeCompare(b.id)
		);
	});
	const batch = limit === 0 ? pending : pending.slice(0, limit);
	let fetched = 0;
	let failed = 0;
	let consecutiveFailures = 0;
	for (const entry of batch) {
		if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
		try {
			const review = parseWineReview(
				await (await request(wineReviewUrl(entry.slug))).text(),
				entry,
				now.toISOString()
			);
			const document = documents.get(entry.sku)!;
			const updated: ProductWineReviews = {
				...document,
				reviews: [...document.reviews.filter((old) => old.id !== review.id), review]
			};
			await writeJson(path.join(outputDir, `${entry.sku}.json`), updated);
			documents.set(entry.sku, updated);
			delete index.failures[entry.id];
			fetched++;
			consecutiveFailures = 0;
		} catch (error) {
			index.failures[entry.id] = now.toISOString();
			failed++;
			consecutiveFailures++;
			log(`Review ${entry.id} unchanged: ${String(error)}`);
			if (consecutiveFailures >= 3) {
				log('Stopping after three consecutive failures; cached reviews are preserved');
				break;
			}
		}
	}
	await writeJson(indexPath, index);
	const remaining = pending.length - fetched;
	log(`Wine reviews: ${fetched} fetched, ${failed} failed, ${remaining} pending`);
	return { fetched, failed, pending: remaining, indexUnavailable: false };
}
