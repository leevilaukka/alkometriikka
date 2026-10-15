import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	PairCounter,
	detailRegionLabel,
	parseTriples,
	regionLabel,
	searchLabels,
	splitSet,
	splitWords
} from '../../scripts/i18n/pairing';
import { FINNISH, loadTranslator } from '../../scripts/i18n/translate';

describe('parseTriples', () => {
	it('reads `prefix|id|label` entries and skips broken ones', () => {
		expect(
			parseTriples(['closureId|closure_A|luonnonkorkki', 'broken', 'x||', 'y|id_only|', 42])
		).toEqual([['closure_A', 'luonnonkorkki']]);
		expect(parseTriples('countryId|FRA|Ranska|')).toEqual([['FRA', 'Ranska']]);
		expect(parseTriples(undefined)).toEqual([]);
	});
});

describe('searchLabels', () => {
	it('keys labels by field and id, pairing group ids with group names', () => {
		const labels = searchLabels({
			mainGroups: ['mainGroupId|mainGroup_003|viinit'],
			productGroupId: ['productGroup_110'],
			productGroupName: ['punaviinit'],
			selectionTypes: ['selectionTypeId|selectionType_001|kausituote']
		});
		expect(Object.fromEntries(labels)).toEqual({
			'mainGroup:mainGroup_003': 'viinit',
			'productGroup:productGroup_110': 'punaviinit',
			'selection:selectionType_001': 'kausituote'
		});
	});
});

describe('splitting', () => {
	it('splits taste words on commas and set values like the app', () => {
		expect(splitWords('Punainen, kuiva ,  tanniininen')).toEqual([
			'Punainen',
			'kuiva',
			'tanniininen'
		]);
		expect(splitSet('Saattaa sisältää sakkaa. Vegaaneille soveltuva tuote')).toEqual([
			'Saattaa sisältää sakkaa',
			'Vegaaneille soveltuva tuote'
		]);
	});

	it('takes the region part of a stored region and of detail production sites', () => {
		expect(regionLabel('Champagne - AC Champagne')).toBe('Champagne');
		expect(regionLabel('Muut')).toBe('Muut');
		expect(regionLabel('')).toBeUndefined();
		expect(
			detailRegionLabel([
				{ label: 'Ranska', searchParams: { countryId: 'FRA' } },
				{ label: 'Champagne', value: 'AC Champagne', searchParams: { regionId: 'r1' } }
			])
		).toBe('Champagne');
		expect(detailRegionLabel(undefined)).toBeUndefined();
	});
});

describe('PairCounter', () => {
	it('keys by the lowercased Finnish value and keeps the most common translation', () => {
		const counter = new PairCounter();
		counter.add('Kausituote', 'seasonal product');
		counter.add('kausituote', 'seasonal product');
		counter.add('kausituote', 'seasonal');
		counter.add('', 'ignored');
		counter.add('ignored', undefined);
		expect(counter.result()).toEqual({ kausituote: 'seasonal product' });
		expect(counter.has('KAUSITUOTE')).toBe(true);
	});

	it('keeps values that read the same in both languages, so they count as checked', () => {
		const counter = new PairCounter();
		counter.add('Stout & porter', 'Stout & porter');
		expect(counter.result()).toEqual({ 'stout & porter': 'Stout & porter' });
	});

	it('pairs word lists by position only when their lengths match', () => {
		const counter = new PairCounter();
		counter.addAligned(['kuiva', 'hapokas'], ['dry', 'acidic']);
		counter.addAligned(['makea'], ['sweet', 'fruity']);
		expect(counter.result()).toEqual({ kuiva: 'dry', hapokas: 'acidic' });
	});

	it('pairs the one word left over, joining adjacent leftovers', () => {
		const counter = new PairCounter();
		counter.addAligned(['kuiva', 'hapokas'], ['dry', 'acidic']);
		counter.addAligned(['tumma'], ['dark']);
		// "paahteinen" is "toasted, roasted" in Alko's English, which splits into two words
		counter.addByElimination(
			['Tumma', 'kuiva', 'paahteinen', 'hapokas'],
			['Dark', 'dry', 'toasted', 'roasted', 'acidic']
		);
		expect(counter.result().paahteinen).toBe('toasted, roasted');
	});

	it('leaves word lists alone when the leftovers are ambiguous', () => {
		const counter = new PairCounter();
		counter.addAligned(['kuiva'], ['dry']);
		// Two unknown Finnish words
		counter.addByElimination(
			['kuiva', 'paahteinen', 'raikas'],
			['dry', 'toasted', 'roasted', 'fresh']
		);
		// Leftovers that aren't next to each other
		counter.addByElimination(['kuiva', 'paahteinen'], ['toasted', 'dry', 'roasted']);
		expect(counter.result()).toEqual({ kuiva: 'dry' });
	});
});

describe('loadTranslator', () => {
	let dir: string;
	afterAll(() => dir && rm(dir, { recursive: true, force: true }));

	it('translates values with the source capitalization and product names by number', async () => {
		dir = await mkdtemp(path.join(tmpdir(), 'labels-'));
		const file = path.join(dir, 'labels.en.json');
		await Bun.write(
			file,
			JSON.stringify({ labels: { punaviinit: 'red wine' }, names: { '123': 'Lager can' } })
		);
		const t = await loadTranslator('en', file);
		expect(t?.value('Punaviinit')).toBe('Red wine');
		expect(t?.value('punaviinit')).toBe('red wine');
		expect(t?.value('Tuntematon')).toBe('Tuntematon');
		expect(t?.name('123', 'Lager tölkki')).toBe('Lager can');
		expect(t?.name('456', 'Muu')).toBe('Muu');
	});

	it('returns null for a missing file, and Finnish stays as is', async () => {
		expect(await loadTranslator('sv', '/nonexistent/labels.sv.json')).toBeNull();
		expect(FINNISH.value('Punaviinit')).toBe('Punaviinit');
	});
});
