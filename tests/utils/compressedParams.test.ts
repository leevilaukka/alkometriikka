import { describe, expect, test } from 'bun:test';
import {
	COMPRESS_THRESHOLD,
	readSearchParams,
	serializeSearchParams
} from '../../src/lib/utils/app/compressedParams';

const countries = ['Ranska', 'Italia', 'Espanja', 'Etelä-Afrikka', 'Itävalta', 'Saksa', 'Chile'];

function longParams() {
	const params = new URLSearchParams();
	for (const country of countries) params.append('Valmistusmaa', country);
	for (const type of ['Punaviinit', 'Valkoviinit', 'Kuohuviinit ja samppanjat'])
		params.append('Tyyppi', type);
	params.set('Hinta', '8.5-25');
	params.set('Alkoholi-%', '11-14');
	params.set('q', 'cabernet & sauvignon = 100%');
	return params;
}

/** What the app reads back from a URL ending in `suffix`. */
function roundTrip(suffix: string) {
	return readSearchParams(new URL(`https://alkometriikka.fi/${suffix}`));
}

describe('serializeSearchParams', () => {
	test('writes nothing for no parameters', () => {
		expect(serializeSearchParams(new URLSearchParams())).toBe('');
	});

	test('leaves short query strings readable', () => {
		const params = new URLSearchParams({ Hinta: '5-20', sort: 'Hinta' });
		expect(serializeSearchParams(params)).toBe(`?${params}`);
	});

	test('compresses long query strings into the fragment, keeping every value and its order', () => {
		const params = longParams();
		expect(params.toString().length).toBeGreaterThan(COMPRESS_THRESHOLD);

		const suffix = serializeSearchParams(params);
		expect(suffix.startsWith('#z=')).toBe(true);
		expect(suffix.length).toBeLessThan(params.toString().length);
		expect(roundTrip(suffix).getAll('Valmistusmaa')).toEqual(countries);
		expect([...roundTrip(suffix)].sort()).toEqual([...params].sort());
	});

	test('keeps sid, flag and list in the query next to the fragment', () => {
		const params = longParams();
		params.set('sid', 'abc12345');
		params.set('flag', 'new-compare');
		params.set('list', 'N4Ig');

		const suffix = serializeSearchParams(params);
		const url = new URL(`https://alkometriikka.fi/${suffix}`);
		expect([...url.searchParams]).toEqual([
			['sid', 'abc12345'],
			['flag', 'new-compare'],
			['list', 'N4Ig']
		]);
		expect(url.hash.startsWith('#z=')).toBe(true);
		expect([...roundTrip(suffix)].sort()).toEqual([...params].sort());
	});

	test('does not count plain parameters toward the threshold', () => {
		const params = new URLSearchParams({ Hinta: '5-20', list: 'x'.repeat(COMPRESS_THRESHOLD) });
		expect(serializeSearchParams(params)).toBe(`?${params}`);
	});

	test('leaves values containing its separators alone', () => {
		const params = longParams();
		params.set('q', 'a\u0001b');
		expect(serializeSearchParams(params)).toBe(`?${params}`);
	});
});

describe('readSearchParams', () => {
	test('returns the URL’s own params when there is nothing to expand', () => {
		const url = new URL('https://alkometriikka.fi/?Hinta=5-20#sisalto');
		expect(readSearchParams(url)).toBe(url.searchParams);
	});

	test('drops an unreadable z but keeps the query', () => {
		const params = readSearchParams(new URL('https://alkometriikka.fi/?sid=abc#z=!!!'));
		expect([...params]).toEqual([['sid', 'abc']]);
	});
});
