import { describe, expect, test } from 'bun:test';
import {
	COMPRESS_THRESHOLD,
	COMPRESSED_PARAM,
	compressSearchParams,
	expandSearchParams
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

/** What the app reads back from a URL written with `query`. */
function roundTrip(query: string) {
	return expandSearchParams(new URL(`https://alkometriikka.fi/?${query}`).searchParams);
}

describe('compressSearchParams', () => {
	test('leaves short query strings readable', () => {
		const params = new URLSearchParams({ Hinta: '5-20', sort: 'Hinta' });
		expect(compressSearchParams(params)).toBe(params.toString());
	});

	test('compresses long query strings into z, keeping every value and its order', () => {
		const params = longParams();
		expect(params.toString().length).toBeGreaterThan(COMPRESS_THRESHOLD);

		const query = compressSearchParams(params);
		expect(query.startsWith(`${COMPRESSED_PARAM}=`)).toBe(true);
		expect(query.length).toBeLessThan(params.toString().length);
		expect(roundTrip(query).getAll('Valmistusmaa')).toEqual(countries);
		expect([...roundTrip(query)].sort()).toEqual([...params].sort());
	});

	test('keeps sid, flag and list readable next to z', () => {
		const params = longParams();
		params.set('sid', 'abc12345');
		params.set('flag', 'new-compare');
		params.set('list', 'N4Ig');

		const query = compressSearchParams(params);
		const url = new URLSearchParams(query);
		expect(url.get('sid')).toBe('abc12345');
		expect(url.get('flag')).toBe('new-compare');
		expect(url.get('list')).toBe('N4Ig');
		expect([...roundTrip(query)].sort()).toEqual([...params].sort());
	});

	test('does not count plain parameters toward the threshold', () => {
		const params = new URLSearchParams({ Hinta: '5-20', list: 'x'.repeat(COMPRESS_THRESHOLD) });
		expect(compressSearchParams(params)).toBe(params.toString());
	});

	test('leaves values containing its separators alone', () => {
		const params = longParams();
		params.set('q', 'a\u0001b');
		expect(compressSearchParams(params)).toBe(params.toString());
	});
});

describe('expandSearchParams', () => {
	test('returns the same params when there is nothing to expand', () => {
		const params = new URLSearchParams({ Hinta: '5-20' });
		expect(expandSearchParams(params)).toBe(params);
	});

	test('drops an unreadable z but keeps the other parameters', () => {
		const params = expandSearchParams(new URLSearchParams({ z: '!!!', sid: 'abc' }));
		expect([...params]).toEqual([['sid', 'abc']]);
	});
});
