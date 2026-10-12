import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	embeddedWineData,
	parseWineIndex,
	parseWineReview,
	reviewText,
	syncWineReviews,
	type WineIndexEntry,
	type ReviewFetcher
} from '../scripts/data/wine-reviews.ts';
import {
	readProductWineReviews,
	selectWineReview,
	wineReviewUrl,
	type WineReview
} from '../src/lib/utils/wine-reviews.ts';

const entry: WineIndexEntry = {
	id: '123456_2024',
	sku: '123456',
	vintage: '2024',
	title: 'Test Wine 2024',
	slug: 'test-wine-2024',
	stars: 4
};
const now = new Date('2026-10-12T12:00:00Z');

function html(overrides: Record<string, unknown> = {}) {
	const wine = {
		alkonumber: '123456',
		vintage: 2024,
		title: 'Test Wine 2024',
		full_review: 'Synthetic review with {braces}, a "quote", and a \\ character.',
		review: {
			stars: 4,
			stars_desc: 'Test rating',
			food: '<p>Test food &amp; cheese</p>',
			storage_desc: 'Ready',
			pricequality_desc: 'Fair value',
			publish_date: { date: '2026-09-01 02:00:00.000000' },
			has_been_published: true
		},
		...overrides
	};
	return `<script>console.log('UUSI KANTA: ', ${JSON.stringify(wine)});</script><html></html>`;
}

function review(overrides: Partial<WineReview> = {}): WineReview {
	return { ...parseWineReview(html(), entry, now.toISOString()), ...overrides };
}

function sourceIndex(
	posts: unknown[] = [
		{ alkonumber: '123456', vintage: '2024', title: entry.title, slug: entry.slug, stars: 4 }
	]
) {
	return { success: true, data: { total: posts.length, posts } };
}

test('extracts full structured review text without executing surrounding JavaScript', () => {
	const parsed = parseWineReview(
		`${html()}<script>throw new Error('must not execute')</script>`,
		entry,
		now.toISOString()
	);
	assert.equal(parsed.text, 'Synthetic review with {braces}, a "quote", and a \\ character.');
	assert.equal(parsed.food, 'Test food & cheese');
	assert.equal(parsed.publishedAt, '2026-09-01');
	assert.equal(parsed.stars, 4);
	assert.throws(() =>
		embeddedWineData("<script>console.log('UUSI KANTA: ', {foo: call()});</script>")
	);
	assert.throws(() => embeddedWineData('<html>Layout changed</html>'));
});

test('rejects a page redirected to a different SKU or vintage and missing text', () => {
	assert.throws(
		() => parseWineReview(html({ alkonumber: '654321' }), entry, now.toISOString()),
		/SKU or vintage/
	);
	assert.throws(
		() => parseWineReview(html({ vintage: 2025 }), entry, now.toISOString()),
		/SKU or vintage/
	);
	assert.throws(
		() => parseWineReview(html({ full_review: '', review: {} }), entry, now.toISOString()),
		/review text/
	);
	assert.ok(
		parseWineReview(html({ review: { has_been_published: false } }), entry, now.toISOString()).text
	);
});

test('normalizes source markup and preserves paragraphs safely', () => {
	assert.equal(
		reviewText('<p>First &amp; second.</p><p>Next &#228;.</p><script>alert(1)</script>'),
		'First & second.\nNext ä.'
	);
	assert.equal(reviewText('&#x110000;'), '&#x110000;');
});

test('bulk index must be complete and excludes foreign codes and unsafe URLs', () => {
	const posts = [
		{ alkonumber: '123456', vintage: '2024', title: 'Wine', slug: 'wine', stars: 4 },
		{ alkonumber: 'vk123456', vintage: '2024', title: 'Foreign', slug: 'foreign' },
		{ alkonumber: '654321', vintage: '2024', title: 'Bad link', slug: '../elsewhere' }
	];
	assert.equal(parseWineIndex(sourceIndex(posts)).length, 1);
	assert.throws(() => parseWineIndex({ success: true, data: { total: 50, posts } }), /incomplete/);
	assert.throws(() => parseWineIndex(sourceIndex([])), /empty/);
	assert.equal(wineReviewUrl('wine-2024'), 'https://viinilehti.fi/viinit/wine-2024/');
});

test('selects an exact vintage before newer reviews, with newest fallback for unknown vintages', () => {
	const old = review({ vintage: '2023' });
	const current = review({ vintage: '2024' });
	const newer = review({ vintage: '2025' });
	const nonVintage = review({ vintage: null });
	assert.equal(selectWineReview([newer, old, current], '2024'), current);
	assert.equal(selectWineReview([old, newer], '2024'), newer);
	assert.equal(selectWineReview([nonVintage, old, newer], ''), newer);
	assert.equal(selectWineReview([], '2024'), undefined);
});

test('client rejects cross-product, unsafe, and incomplete cached records', () => {
	const valid = review();
	assert.deepEqual(
		readProductWineReviews({ version: 1, sku: '123456', reviews: [valid] }, '123456'),
		[valid]
	);
	assert.deepEqual(
		readProductWineReviews({ version: 1, sku: '654321', reviews: [valid] }, '123456'),
		[]
	);
	assert.deepEqual(
		readProductWineReviews(
			{ version: 1, sku: '123456', reviews: [review({ slug: '../bad' }), { ...valid, text: '' }] },
			'123456'
		),
		[]
	);
});

test('sync fills only matching active SKUs and reuses fresh index and page cache', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'alkometriikka-reviews-'));
	try {
		const requests: string[] = [];
		const fetcher = (async (input: RequestInfo | URL) => {
			const url = String(input);
			requests.push(url);
			if (url.includes('sl_nonces'))
				return Response.json({ success: true, data: { search: 'test-nonce' } });
			if (url.includes('sl_wine_search'))
				return Response.json(
					sourceIndex([
						{ alkonumber: '123456', vintage: 2024, title: entry.title, slug: entry.slug, stars: 4 },
						{ alkonumber: '654321', vintage: 2024, title: 'Removed', slug: 'removed', stars: 4 },
						{
							alkonumber: '987654',
							vintage: 2024,
							title: 'Not in catalog',
							slug: 'other',
							stars: 4
						}
					])
				);
			return new Response(html());
		}) as ReviewFetcher;
		const options = {
			catalog: {
				products: { '123456': {}, '654321': { meta: { removedFromSelection: '2026-01-01' } } }
			},
			outputDir: dir,
			now,
			delayMs: 0,
			fetcher,
			log: () => {}
		};
		assert.equal((await syncWineReviews(options)).fetched, 1);
		assert.equal(requests.length, 3);
		assert.equal(
			JSON.parse(await readFile(path.join(dir, '123456.json'), 'utf8')).reviews[0].text,
			review().text
		);
		requests.length = 0;
		assert.equal((await syncWineReviews(options)).fetched, 0);
		assert.equal(requests.length, 0);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('bounded batches resume and retain reviews of previously collected vintages', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'alkometriikka-reviews-'));
	try {
		const historical = review({ id: '123456_2023', vintage: '2023', title: 'Test Wine 2023' });
		await writeFile(
			path.join(dir, '123456.json'),
			JSON.stringify({ version: 1, sku: '123456', reviews: [historical] })
		);
		let pageRequests = 0;
		const fetcher: ReviewFetcher = async (input) => {
			const url = String(input);
			if (url.includes('sl_nonces'))
				return Response.json({ success: true, data: { search: 'test' } });
			if (url.includes('sl_wine_search'))
				return Response.json(
					sourceIndex([
						{ alkonumber: '123456', vintage: 2024, title: entry.title, slug: entry.slug, stars: 4 },
						{
							alkonumber: '654321',
							vintage: 2025,
							title: 'Other Wine 2025',
							slug: 'other-wine-2025',
							stars: 4
						}
					])
				);
			pageRequests++;
			return new Response(
				url.includes('other-wine') ? html({ alkonumber: '654321', vintage: 2025 }) : html()
			);
		};
		const options = {
			catalog: { products: { '123456': {}, '654321': {} } },
			outputDir: dir,
			now,
			delayMs: 0,
			limit: 1,
			fetcher,
			log: () => {}
		};
		assert.deepEqual(await syncWineReviews(options), {
			fetched: 1,
			failed: 0,
			pending: 1,
			indexUnavailable: false
		});
		const stored = readProductWineReviews(
			JSON.parse(await readFile(path.join(dir, '123456.json'), 'utf8')),
			'123456'
		);
		assert.equal(stored.length, 2);
		assert.equal(selectWineReview(stored, '2023')?.id, historical.id);
		assert.equal((await syncWineReviews(options)).fetched, 1);
		assert.equal((await syncWineReviews(options)).fetched, 0);
		assert.equal(pageRequests, 2);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test('source failures and incomplete index preserve previously collected review files', async () => {
	const dir = await mkdtemp(path.join(tmpdir(), 'alkometriikka-reviews-'));
	try {
		const index = { version: 1, fetchedAt: now.toISOString(), entries: [entry], failures: {} };
		await writeFile(path.join(dir, '_index.json'), JSON.stringify(index));
		const old = JSON.stringify({
			version: 1,
			sku: '123456',
			reviews: [review({ fetchedAt: '2026-01-01T00:00:00Z' })]
		});
		await writeFile(path.join(dir, '123456.json'), old);
		const options = {
			catalog: { products: { '123456': {} } },
			outputDir: dir,
			now,
			delayMs: 0,
			log: () => {}
		};
		const failed = await syncWineReviews({
			...options,
			fetcher: (async () => new Response('Unavailable', { status: 503 })) as ReviewFetcher
		});
		assert.equal(failed.failed, 1);
		assert.equal(await readFile(path.join(dir, '123456.json'), 'utf8'), old);
		let calls = 0;
		await syncWineReviews({
			...options,
			fetcher: (async () => {
				calls++;
				throw new Error('should be in cooldown');
			}) as ReviewFetcher
		});
		assert.equal(calls, 0);
		const partialFetcher = (async (input: RequestInfo | URL) =>
			String(input).includes('sl_nonces')
				? Response.json({ success: true, data: { search: 'test' } })
				: Response.json({ success: true, data: { total: 10, posts: [] } })) as ReviewFetcher;
		const partial = await syncWineReviews({ ...options, force: true, fetcher: partialFetcher });
		assert.equal(partial.indexUnavailable, true);
		assert.equal(await readFile(path.join(dir, '123456.json'), 'utf8'), old);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
