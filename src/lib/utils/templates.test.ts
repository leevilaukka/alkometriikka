import { beforeAll, describe, expect, it } from 'bun:test';

// DOM/browser globals and $app/* stubs are provided by test-setup.ts (bunfig [test] preload).

const { Kaljakori } = await import('../alko/index');
const {
	listTemplates,
	resolveTemplate,
	rerollSlotItem,
	createListFromTemplate,
	customTemplateToListTemplate,
	createCustomTemplateId
} = await import('./templates');
const { lists } = await import('$lib/global.svelte');
const { AllColumns } = await import('./constants');

const SCHEMA = [
	'Numero',
	'Nimi',
	'Valmistaja',
	'Pullokoko',
	'Hinta',
	'Litrahinta',
	'Uutuus',
	'Hinnastojärjestyskoodi',
	'Tyyppi',
	'Alatyyppi',
	'Erityisryhmä',
	'Oluttyyppi',
	'Valmistusmaa',
	'Alue',
	'Vuosikerta',
	'Etikettimerkintöjä',
	'Huomautus',
	'Rypäleet',
	'Luonnehdinta',
	'Pakkaustyyppi',
	'Suljentatyyppi',
	'Alkoholi-%',
	'Hapot g/l',
	'Sokeri g/l',
	'Kantavierrep-%',
	'Väri EBC',
	'Katkerot EBU',
	'Energia kcal/100 ml',
	'Valikoima',
	'EAN'
];

type RowOverrides = Partial<Record<(typeof SCHEMA)[number], string | number | null>>;

function makeRow(overrides: RowOverrides): (string | number | null)[] {
	const base: RowOverrides = {
		Numero: '000000',
		Nimi: 'Testituote',
		Valmistaja: 'Testi',
		Pullokoko: 0.75,
		Hinta: 10,
		Litrahinta: 13.33,
		Uutuus: '',
		'Hinnastojärjestyskoodi': null,
		Tyyppi: 'Viinit',
		Alatyyppi: 'Punaviinit',
		Erityisryhmä: null,
		Oluttyyppi: null,
		Valmistusmaa: 'Suomi',
		Alue: null,
		Vuosikerta: null,
		'Etikettimerkintöjä': null,
		Huomautus: '',
		'Rypäleet': '',
		Luonnehdinta: '',
		Pakkaustyyppi: 'pullove',
		Suljentatyyppi: 'korkki',
		'Alkoholi-%': 12,
		'Hapot g/l': null,
		'Sokeri g/l': null,
		'Kantavierrep-%': null,
		'Väri EBC': null,
		'Katkerot EBU': null,
		'Energia kcal/100 ml': null,
		Valikoima: 'vakiovalikoima',
		EAN: null,
		...overrides
	};
	return SCHEMA.map((col) => base[col as keyof typeof base] ?? null);
}

const PRODUCTS: RowOverrides[] = [
	// Red wines
	{ Numero: '000001', Nimi: 'Punaviini A', Tyyppi: 'Viinit', Alatyyppi: 'Punaviinit', Hinta: 12 },
	{ Numero: '000002', Nimi: 'Punaviini B', Tyyppi: 'Viinit', Alatyyppi: 'Punaviinit', Hinta: 15 },
	{ Numero: '000003', Nimi: 'Punaviini C', Tyyppi: 'Punaviinit', Alatyyppi: 'Roteva & Voimakas', Hinta: 11 },
	// White wines
	{ Numero: '000004', Nimi: 'Valkoviini A', Tyyppi: 'Viinit', Alatyyppi: 'Valkoviinit', Hinta: 12 },
	{ Numero: '000005', Nimi: 'Valkoviini B', Tyyppi: 'Valkoviinit', Alatyyppi: 'Pirteä & Hedelmäinen', Hinta: 14 },
	// Sparkling
	{ Numero: '000006', Nimi: 'Kuohuva Halpa', Tyyppi: 'Viinit', Alatyyppi: 'Kuohuviinit ja samppanjat', Hinta: 15 },
	{ Numero: '000007', Nimi: 'Samppanja Kallis', Tyyppi: 'Kuohuviinit ja samppanjat', Alatyyppi: 'Runsas & paahteinen', Hinta: 45 },
	// Beers (single-serving)
	{ Numero: '000008', Nimi: 'Olut A', Tyyppi: 'Panimotuotteet', Alatyyppi: 'Oluet', Pullokoko: 0.33, Hinta: 3 },
	{ Numero: '000009', Nimi: 'Olut B', Tyyppi: 'Oluet', Alatyyppi: 'Lager', Pullokoko: 0.33, Hinta: 4 },
	{ Numero: '000010', Nimi: 'Olut C', Tyyppi: 'Panimotuotteet', Alatyyppi: 'Oluet', Pullokoko: 0.5, Hinta: 5 },
	// Beer multipack (should be excluded from budget template)
	{ Numero: '000011', Nimi: 'Olut 24-pack', Tyyppi: 'Panimotuotteet', Alatyyppi: 'Oluet', Pullokoko: 7.92, Hinta: 30 },
	// Ciders / mixed drinks
	{ Numero: '000012', Nimi: 'Siideri A', Tyyppi: 'Panimotuotteet', Alatyyppi: 'Siiderit', Pullokoko: 0.33, Hinta: 3 },
	{ Numero: '000013', Nimi: 'Lonkero A', Tyyppi: 'Juomasekoitukset', Alatyyppi: 'Greippinen', Pullokoko: 0.33, Hinta: 4 },
	// Non-alcoholic
	{ Numero: '000014', Nimi: 'Kola', Tyyppi: 'Alkoholittomat', Alatyyppi: 'Mikserit', 'Alkoholi-%': 0, Pullokoko: 0.33, Hinta: 1.5 },
	{ Numero: '000015', Nimi: 'Alkoholiton olut', Tyyppi: 'Alkoholittomat', Alatyyppi: 'Alkoholittomat oluet', 'Alkoholi-%': 0.4, Pullokoko: 0.33, Hinta: 2.5 },
	{ Numero: '000016', Nimi: 'Alkoholiton viini', Tyyppi: 'Viinit', Alatyyppi: 'Punaviinit', 'Alkoholi-%': 0.4, Hinta: 9 },
	// Removed from selection (should never be picked)
	{ Numero: '000017', Nimi: 'Punaviini Poistunut', Tyyppi: 'Viinit', Alatyyppi: 'Punaviinit', Hinta: 1 },
	// New products
	{ Numero: '000018', Nimi: 'Uutuus A', Tyyppi: 'Viinit', Alatyyppi: 'Valkoviinit', Uutuus: 'uutuus', Hinta: 13 },
	{ Numero: '000019', Nimi: 'Uutuus B', Tyyppi: 'Väkevät', Alatyyppi: 'Vodkat', Uutuus: 'uutuus', Hinta: 20 }
];

function buildTable(): any[][] {
	const header = [...SCHEMA, 'Hintahistoria', 'Poistunut valikoimasta'];
	const rows = PRODUCTS.map((overrides) => {
		const row = makeRow(overrides);
		const removed = overrides.Numero === '000017';
		return [...row, [], removed];
	});
	return [header, ...rows];
}

let kaljakori: InstanceType<typeof Kaljakori>;

beforeAll(() => {
	const realLog = console.log;
	console.log = () => {};
	kaljakori = new Kaljakori(buildTable());
	console.log = realLog;
});

function template(id: string) {
	const t = listTemplates.find((t) => t.id === id);
	if (!t) throw new Error(`template ${id} not found`);
	return t;
}

function allPicked(resolution: ReturnType<typeof resolveTemplate>) {
	return resolution.slots.flatMap((s) => s.picked);
}

describe('resolveTemplate', () => {
	it('dinner template fills all three slots with correct types', () => {
		const r = resolveTemplate(template('dinner'), kaljakori);
		expect(r.itemCount).toBe(3);
		const redSlot = r.slots.find((s) => s.slot.label === 'Punaviini');
		const whiteSlot = r.slots.find((s) => s.slot.label === 'Valkoviini');
		const nonAlcSlot = r.slots.find((s) => s.slot.label === 'Alkoholiton');
		expect(redSlot?.picked.length).toBe(1);
		expect(whiteSlot?.picked.length).toBe(1);
		expect(nonAlcSlot?.picked.length).toBe(1);
		// red/white picked from the expected pools
		expect(['000001', '000002', '000003']).toContain(String(redSlot?.picked[0][AllColumns.Number]));
		expect(['000004', '000005']).toContain(String(whiteSlot?.picked[0][AllColumns.Number]));
		// non-alcoholic pick is <=0.5%
		expect(Number(nonAlcSlot?.picked[0][AllColumns.AlcoholPercentage])).toBeLessThanOrEqual(0.5);
	});

	it('excludes products removed from selection', () => {
		// 000017 is the cheapest red (1€) but removed; cheapest strategy must not pick it
		const r = resolveTemplate(template('budget-50'), kaljakori);
		const picked = allPicked(r);
		expect(picked.some((p) => p[AllColumns.Number] === '000017')).toBe(false);
	});

	it('budget template stays within budget and skips multipacks', () => {
		const r = resolveTemplate(template('budget-50'), kaljakori);
		expect(r.totalPrice).toBeLessThanOrEqual(50);
		const picked = allPicked(r);
		// 24-pack excluded by bottle size cap
		expect(picked.some((p) => p[AllColumns.Number] === '000011')).toBe(false);
	});

	it('budget template fills both wine slots (wines resolved first)', () => {
		const r = resolveTemplate(template('budget-50'), kaljakori);
		const wineSlots = r.slots.filter((s) => s.slot.label.includes('viini'));
		for (const slot of wineSlots) {
			expect(slot.picked.length).toBe(slot.slot.quantity);
		}
	});

	it('non-alcoholic template only picks <=0.5% products', () => {
		const r = resolveTemplate(template('non-alcoholic'), kaljakori);
		const picked = allPicked(r);
		expect(picked.length).toBeGreaterThan(0);
		for (const p of picked) {
			expect(Number(p[AllColumns.AlcoholPercentage])).toBeLessThanOrEqual(0.5);
		}
	});

	it('sparkling template picks one cheap and one premium sparkling', () => {
		const r = resolveTemplate(template('sparkling'), kaljakori);
		expect(r.itemCount).toBe(2);
		const picked = allPicked(r);
		const prices = picked.map((p) => Number(p[AllColumns.Price])).sort((a, b) => a - b);
		expect(prices[0]).toBeLessThan(20);
		expect(prices[1]).toBeGreaterThanOrEqual(20);
	});

	it('new-products template only picks Uutuus items', () => {
		const r = resolveTemplate(template('new-products'), kaljakori);
		const picked = allPicked(r);
		expect(picked.length).toBe(2);
		for (const p of picked) {
			expect(String(p[AllColumns.New]).toLowerCase()).toBe('uutuus');
		}
	});

	it('does not pick the same product for two slots', () => {
		const r = resolveTemplate(template('dinner'), kaljakori);
		const numbers = allPicked(r).map((p) => p[AllColumns.Number]);
		expect(new Set(numbers).size).toBe(numbers.length);
	});

	it('storeName option restricts candidates to that store', () => {
		// Only 000001 is available in "Testi Myymälä"
		const availability = {
			stores: { s1: { id: 's1', name: 'Testi Myymälä' } },
			product: { '000001': ['s1'] }
		};
		const realLog = console.log;
		console.log = () => {};
		const storeKaljakori = new Kaljakori(buildTable(), undefined, availability);
		console.log = realLog;
		const r = resolveTemplate(template('dinner'), storeKaljakori, { storeName: 'Testi Myymälä' });
		const picked = allPicked(r);
		// red slot should find 000001; white and non-alcoholic have nothing in store
		expect(picked.some((p) => p[AllColumns.Number] === '000001')).toBe(true);
		const whiteSlot = r.slots.find((s) => s.slot.label === 'Valkoviini');
		expect(whiteSlot?.picked.length).toBe(0);
	});

	it('exclude option removes those products from the pool', () => {
		const r = resolveTemplate(template('dinner'), kaljakori, {
			exclude: new Set(['000001', '000002', '000003'])
		});
		const redSlot = r.slots.find((s) => s.slot.label === 'Punaviini');
		expect(redSlot?.picked.length).toBe(0);
	});
});

describe('rerollSlotItem', () => {
	it('excludes given numbers and respects the budget headroom', () => {
		const redSlot = template('budget-50').slots[0]; // red wine, best-value, capped <=15
		// Exclude the two affordable reds (000003=11€, 000001=12€) AND the cheap
		// non-alcoholic red (000016=9€) that also matches the spec. The only
		// remaining red is 000002=15€, which exceeds the 10€ headroom -> empty.
		const tight = rerollSlotItem(redSlot, kaljakori, {
			exclude: new Set(['000001', '000003', '000016']),
			budget: 50,
			spent: 40
		});
		expect(tight.picked.length).toBe(0);
		expect(tight.reason).toBe('budget');

		// With 15€ headroom the 15€ red fits.
		const fits = rerollSlotItem(redSlot, kaljakori, {
			exclude: new Set(['000001', '000003', '000016']),
			budget: 50,
			spent: 35
		});
		expect(fits.picked.length).toBe(1);
		expect(String(fits.picked[0][AllColumns.Number])).toBe('000002');
	});

	it('respects the slot pick strategy', () => {
		const redSlot = template('budget-50').slots[0]; // best-value
		const r = rerollSlotItem(redSlot, kaljakori, {});
		expect(r.picked.length).toBe(1);
		// best-value = highest alcohol-grams/€; with identical 0.75 l / 12% the
		// cheapest red (000003 = 11€) wins.
		expect(String(r.picked[0][AllColumns.Number])).toBe('000003');
	});
});

describe('createListFromTemplate', () => {
	it('creates a list with the resolved products', () => {
		const before = lists.length;
		const { list } = createListFromTemplate(template('dinner'), kaljakori);
		expect(lists.length).toBe(before + 1);
		expect(list.name).toBe('Illallinen neljälle');
		expect(list.items.length).toBe(3);
		expect(list.items.every((i) => i.q === 1)).toBe(true);
	});
});

describe('customTemplateToListTemplate', () => {
	it('converts arrays to Sets and preserves ranges, then resolves', () => {
		const custom = {
			id: createCustomTemplateId(),
			name: 'Testi',
			description: '',
			icon: 'star' as const,
			createdAt: Date.now(),
			slots: [
				{
					label: 'Punat',
					quantity: 1,
					pick: 'cheapest' as const,
					specs: [
						{
							[AllColumns.Type]: ['Viinit'],
							[AllColumns.SubType]: ['Punaviinit'],
							[AllColumns.Price]: [0, 12] as [number, number]
						}
					]
				}
			]
		};
		const lt = customTemplateToListTemplate(custom);
		// string arrays become Sets, [number,number] stays a range
		expect(lt.slots[0].specs[0][AllColumns.Type]).toBeInstanceOf(Set);
		expect(lt.slots[0].specs[0][AllColumns.Price]).toEqual([0, 12]);

		const r = resolveTemplate(lt, kaljakori);
		expect(r.slots[0].picked.length).toBe(1);
		// cheapest Viinit/Punaviinit within 0-12€ (excludes 000003 'Punaviinit' flat
		// type and 000016 at 9€? no — 000016 is Viinit/Punaviinit at 9€, but cheapest
		// within range among {000001=12,000016=9} is 000016)
		expect(Number(r.slots[0].picked[0][AllColumns.Price])).toBeLessThanOrEqual(12);
	});

	it('is JSON round-trippable', () => {
		const custom = {
			id: createCustomTemplateId(),
			name: 'RT',
			description: 'd',
			icon: 'heart' as const,
			budget: 30,
			createdAt: Date.now(),
			slots: [
				{
					label: 'Oluet',
					quantity: 2,
					pick: 'best-value' as const,
					specs: [{ [AllColumns.SubType]: ['Oluet'], [AllColumns.BottleSize]: [0, 0.6] as [number, number] }]
				}
			]
		};
		const revived = customTemplateToListTemplate(JSON.parse(JSON.stringify(custom)));
		expect(revived.budget).toBe(30);
		expect(revived.slots[0].specs[0][AllColumns.SubType]).toBeInstanceOf(Set);
		const r = resolveTemplate(revived, kaljakori);
		expect(r.totalPrice).toBeLessThanOrEqual(30);
		expect(r.slots[0].picked.length).toBeGreaterThan(0);
	});
});
