import { describe, expect, it } from 'bun:test';
import type { AvailabilityStore } from '$lib/types';
import {
	filterStoresByQuery,
	getNormalOpeningHours,
	getTodaysOpeningHours,
	parseStoreAccessibility
} from '$lib/utils/catalog/availability';

// Store 2848 on 2026-10-24: closed for a move, its regular hours still in the normal calendar
const store: AvailabilityStore = {
	id: '2848',
	name: 'Kuusamo Ruka',
	openHours: [
		{ hours: 'Kiinni', date: '2026-10-24' },
		{ hours: 'Kiinni', date: '2026-10-25' }
	],
	openHoursNormal: [
		{ hours: '10–21', date: '2026-10-23' },
		{ hours: '10–18', date: '2026-10-24' },
		{ hours: 'Kiinni', date: '2026-10-25' }
	]
};

describe('filterStoresByQuery', () => {
	const stores: AvailabilityStore[] = [
		{ id: '1', name: 'Turku Kupittaa', address: 'Uudenmaankatu 1', postalCode: '20500' },
		{ id: '2', name: 'Raisio Mylly', postOffice: 'RAISIO' },
		{ id: '3', name: 'Hämeenlinna Goodman' }
	];
	const ids = (query: string) => filterStoresByQuery(stores, query).map((store) => store.id);

	it('matches name, address, postal code and post office in any case', () => {
		expect(ids('turku')).toEqual(['1']);
		expect(ids('uudenmaan')).toEqual(['1']);
		expect(ids('20500')).toEqual(['1']);
		expect(ids('raisio')).toEqual(['2']);
		expect(ids('HÄMEEN')).toEqual(['3']);
	});

	it('ignores surrounding whitespace and returns every store for an empty query', () => {
		expect(ids('  turku ')).toEqual(['1']);
		expect(ids(' ')).toEqual(['1', '2', '3']);
	});

	it('returns nothing without a match', () => {
		expect(ids('oulu')).toEqual([]);
	});
});

describe('getNormalOpeningHours', () => {
	it('returns the regular hours, not the exception', () => {
		expect(getNormalOpeningHours(store, '2026-10-24')).toBe('10–18');
		expect(getTodaysOpeningHours(store, new Date('2026-10-24T09:00:00Z'))).toBe('Kiinni');
	});

	it('returns null outside the calendar or without one', () => {
		expect(getNormalOpeningHours(store, '2026-11-02')).toBeNull();
		expect(getNormalOpeningHours({ id: '1', name: 'x' }, '2026-10-24')).toBeNull();
	});
});

describe('parseStoreAccessibility', () => {
	it('splits a notice from the "esteetön" glued to its end', () => {
		expect(parseStoreAccessibility('Lähin myymälä on Alko Posio.esteetön')).toEqual({
			notice: 'Lähin myymälä on Alko Posio.',
			accessible: true
		});
	});

	it('reads a plain flag in either case', () => {
		expect(parseStoreAccessibility('Esteetön')).toEqual({ notice: null, accessible: true });
		expect(parseStoreAccessibility(' esteetön')).toEqual({ notice: null, accessible: true });
	});

	it('does not read "ei esteetön" as accessible', () => {
		expect(parseStoreAccessibility('ei esteetön').accessible).toBe(false);
	});

	it('drops values without any text', () => {
		expect(parseStoreAccessibility('.')).toEqual({ notice: null, accessible: false });
		expect(parseStoreAccessibility(undefined)).toEqual({ notice: null, accessible: false });
	});
});
