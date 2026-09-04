import type { Kaljakori } from '$lib/alko';
import type { IconName } from '$lib/icons';
import type { ColumnNames, ListObj, PriceListItem } from '$lib/types';
import { AllColumns } from './constants';
import { addToList, createList } from './lists';

/**
 * A single filter spec for a template slot.
 * Mirrors the active-filter shape the UI passes to Kaljakori.fuzzySearchAndFilter:
 * number columns -> [min, max] range, string columns -> Set of allowed values.
 */
export type TemplateFilterSpec = Partial<Record<ColumnNames, [number, number] | Set<string>>>;

export type SlotPickStrategy = 'cheapest' | 'best-value' | 'random';

export type TemplateSlot = {
	/** Shown to the user if the slot can't be filled completely. */
	label: string;
	/**
	 * OR semantics: a product matching ANY of the specs is a candidate.
	 * Needed because the dataset mixes two type taxonomies side by side
	 * (e.g. Tyyppi "punaviinit" vs. Tyyppi "Viinit" + Alatyyppi "punaviinit").
	 */
	specs: TemplateFilterSpec[];
	quantity: number;
	pick: SlotPickStrategy;
};

export type ListTemplate = {
	id: string;
	name: string;
	description: string;
	icon: IconName;
	slots: TemplateSlot[];
	/** If set, no product is added that would push the list total above this (€). */
	budget?: number;
};

export type SlotResolution = {
	slot: TemplateSlot;
	picked: PriceListItem[];
	/** Why the slot was left partially filled. Undefined when fully filled. */
	reason?: 'no-matches' | 'budget';
};

export type TemplateResolution = {
	template: ListTemplate;
	slots: SlotResolution[];
	totalPrice: number;
	itemCount: number;
};

export type TemplateOptions = {
	/** Restrict candidates to products available in this store (store NAME, matching StoreAvailability). */
	storeName?: string;
	/** Product numbers to exclude from all candidate pools (e.g. already-picked items). */
	exclude?: Set<string>;
};

// --- Custom (user-built) templates -------------------------------------------
// Sets aren't JSON-serializable, so custom templates use arrays on the wire and
// are converted to a ListTemplate (with Set specs) at resolve time.

export type SerializedTemplateFilterSpec = Partial<
	Record<ColumnNames, [number, number] | string[]>
>;

export type CustomTemplateSlot = {
	label: string;
	specs: SerializedTemplateFilterSpec[];
	quantity: number;
	pick: SlotPickStrategy;
};

export type CustomTemplate = {
	id: string;
	name: string;
	description: string;
	icon: IconName;
	slots: CustomTemplateSlot[];
	budget?: number;
	createdAt: number;
};

export function createCustomTemplateId(): string {
	return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Convert a serializable custom template into a resolvable ListTemplate. */
export function customTemplateToListTemplate(template: CustomTemplate): ListTemplate {
	return {
		id: template.id,
		name: template.name,
		description: template.description,
		icon: template.icon,
		budget: template.budget,
		slots: template.slots.map((slot) => ({
			label: slot.label,
			quantity: slot.quantity,
			pick: slot.pick,
			specs: slot.specs.map((spec) =>
				Object.fromEntries(
					Object.entries(spec).map(([column, value]) => [
						column,
						Array.isArray(value) &&
						value.length === 2 &&
						typeof value[0] === 'number' &&
						typeof value[1] === 'number'
							? (value as [number, number])
							: new Set(value as string[])
					])
				) as TemplateFilterSpec
			)
		}))
	};
}

// --- Shared filter specs -----------------------------------------------------

function withPrice(specs: TemplateFilterSpec[], min: number, max: number): TemplateFilterSpec[] {
	return specs.map((spec) => ({ ...spec, [AllColumns.Price]: [min, max] as [number, number] }));
}

/** Restrict specs to single-serving package sizes (e.g. no 24-packs in a budget mix). */
function withMaxBottleSize(specs: TemplateFilterSpec[], maxLiters: number): TemplateFilterSpec[] {
	return specs.map((spec) => ({
		...spec,
		[AllColumns.BottleSize]: [0, maxLiters] as [number, number]
	}));
}

// NOTE: Kaljakori capitalizes the first letter of string values when parsing,
// so these must match the formatted values (e.g. "Punaviinit", not "punaviinit").
const RED_WINES: TemplateFilterSpec[] = [
	{ [AllColumns.Type]: new Set(['Punaviinit']) },
	{ [AllColumns.Type]: new Set(['Viinit']), [AllColumns.SubType]: new Set(['Punaviinit']) }
];

const WHITE_WINES: TemplateFilterSpec[] = [
	{ [AllColumns.Type]: new Set(['Valkoviinit']) },
	{ [AllColumns.Type]: new Set(['Viinit']), [AllColumns.SubType]: new Set(['Valkoviinit']) }
];

const SPARKLING_WINES: TemplateFilterSpec[] = [
	{ [AllColumns.Type]: new Set(['Kuohuviinit ja samppanjat']) },
	{
		[AllColumns.Type]: new Set(['Viinit']),
		[AllColumns.SubType]: new Set(['Kuohuviinit ja samppanjat'])
	}
];

const BEERS: TemplateFilterSpec[] = [
	{ [AllColumns.Type]: new Set(['Oluet']) },
	{ [AllColumns.Type]: new Set(['Panimotuotteet']), [AllColumns.SubType]: new Set(['Oluet']) }
];

const CIDERS_AND_MIXED: TemplateFilterSpec[] = [
	{ [AllColumns.Type]: new Set(['Siiderit', 'Juomasekoitukset']) },
	{
		[AllColumns.Type]: new Set(['Panimotuotteet']),
		[AllColumns.SubType]: new Set(['Siiderit', 'Juomasekoitukset'])
	}
];

const NON_ALCOHOLIC: TemplateFilterSpec[] = [
	{ [AllColumns.Type]: new Set(['Alkoholittomat']) },
	{ [AllColumns.AlcoholPercentage]: [0, 0.5] }
];

// --- Templates ---------------------------------------------------------------

export const listTemplates: ListTemplate[] = [
	{
		id: 'dinner',
		name: 'Illallinen neljälle',
		description: 'Punaviini, valkoviini ja alkoholiton vaihtoehto ruokailun kylkeen.',
		icon: 'restaurant',
		slots: [
			{ label: 'Punaviini', specs: withPrice(RED_WINES, 10, 20), quantity: 1, pick: 'random' },
			{ label: 'Valkoviini', specs: withPrice(WHITE_WINES, 10, 20), quantity: 1, pick: 'random' },
			{ label: 'Alkoholiton', specs: NON_ALCOHOLIC, quantity: 1, pick: 'random' }
		]
	},
	{
		id: 'budget-50',
		name: 'Alle 50 €',
		description: 'Mahdollisimman paljon valikoimaa alle 50 eurolla.',
		icon: 'euro',
		budget: 50,
		slots: [
			// Wines first: they anchor the budget, capped so neither can starve the
			// rest. Beer/cider fill what remains, capped to single-serving sizes so
			// a cheap 24-pack can't eat the budget.
			{ label: 'Punaviini', specs: withPrice(RED_WINES, 0, 15), quantity: 1, pick: 'best-value' },
			{ label: 'Valkoviini', specs: withPrice(WHITE_WINES, 0, 15), quantity: 1, pick: 'best-value' },
			{ label: 'Oluet', specs: withMaxBottleSize(BEERS, 0.6), quantity: 3, pick: 'best-value' },
			{
				label: 'Siiderit ja juomasekoitukset',
				specs: withMaxBottleSize(CIDERS_AND_MIXED, 0.6),
				quantity: 2,
				pick: 'best-value'
			}
		]
	},
	{
		id: 'non-alcoholic',
		name: 'Alkoholittomat',
		description: 'Alkoholittomia vaihtoehtoja joka makuun.',
		icon: 'water',
		slots: [{ label: 'Alkoholittomat', specs: NON_ALCOHOLIC, quantity: 5, pick: 'random' }]
	},
	{
		id: 'sparkling',
		name: 'Kuohuvat juhlaan',
		description: 'Edullisempi kuohuva arkeen ja hienompi juhlahetkeen.',
		icon: 'wine',
		slots: [
			{
				label: 'Kuohuviini',
				specs: withPrice(SPARKLING_WINES, 0, 20),
				quantity: 1,
				pick: 'random'
			},
			{
				label: 'Samppanja tai premium-kuohuva',
				specs: withPrice(SPARKLING_WINES, 20, 500),
				quantity: 1,
				pick: 'random'
			}
		]
	},
	{
		id: 'new-products',
		name: 'Uutuudet',
		description: 'Satunnainen otos tämän hetken uutuuksista.',
		icon: 'pencil_sparkles',
		slots: [
			{
				label: 'Uutuudet',
				specs: [{ [AllColumns.New]: new Set(['uutuus', 'Uutuus']) }],
				quantity: 6,
				pick: 'random'
			}
		]
	}
];

// --- Resolution --------------------------------------------------------------

function shuffle<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

/** Union of all products matching any of the slot's specs, deduped by product number. */
function findCandidates(slot: TemplateSlot, kaljakori: Kaljakori): PriceListItem[] {
	const seen = new Set<string>();
	const candidates: PriceListItem[] = [];
	for (const spec of slot.specs) {
		for (const item of kaljakori.fuzzySearchAndFilter('', spec)) {
			const number = item[AllColumns.Number];
			if (seen.has(number)) continue;
			seen.add(number);
			candidates.push(item);
		}
	}
	return candidates;
}

export function resolveTemplate(
	template: ListTemplate,
	kaljakori: Kaljakori,
	options: TemplateOptions = {}
): TemplateResolution {
	const pickedNumbers = new Set<string>();
	let totalPrice = 0;

	const slots = template.slots.map((slot): SlotResolution => {
		let candidates = findCandidates(slot, kaljakori).filter((item) => {
			if (item[AllColumns.RemovedFromSelection]) return false;
			if (pickedNumbers.has(item[AllColumns.Number])) return false;
			if (options.exclude?.has(item[AllColumns.Number])) return false;
			if (options.storeName) {
				const stores = item[AllColumns.StoreAvailability];
				if (!(stores instanceof Set) || !stores.has(options.storeName)) return false;
			}
			return true;
		});

		// Under a budget, drop candidates that are already unaffordable so a
		// premium pick can't consume the whole budget before later slots resolve.
		if (template.budget !== undefined)
			candidates = candidates.filter(
				(item) => totalPrice + (Number(item[AllColumns.Price]) || 0) <= template.budget!
			);

		if (slot.pick === 'cheapest') {
			candidates.sort((a, b) => Number(a[AllColumns.Price]) - Number(b[AllColumns.Price]));
		} else if (slot.pick === 'best-value') {
			candidates.sort(
				(a, b) =>
					Number(b[AllColumns.AlcoholGramsPerEuro]) - Number(a[AllColumns.AlcoholGramsPerEuro])
			);
		} else {
			candidates = shuffle(candidates);
		}

		const picked: PriceListItem[] = [];
		let blockedByBudget = false;
		for (const item of candidates) {
			if (picked.length >= slot.quantity) break;
			const price = Number(item[AllColumns.Price]) || 0;
			if (template.budget !== undefined && totalPrice + price > template.budget) {
				blockedByBudget = true;
				continue;
			}
			picked.push(item);
			pickedNumbers.add(item[AllColumns.Number]);
			totalPrice += price;
		}

		return {
			slot,
			picked,
			reason:
				picked.length < slot.quantity ? (blockedByBudget ? 'budget' : 'no-matches') : undefined
		};
	});

	return {
		template,
		slots,
		totalPrice,
		itemCount: slots.reduce((count, slot) => count + slot.picked.length, 0)
	};
}

/**
 * Re-roll a single slot against a fresh candidate pool, excluding the given
 * product numbers (typically everything already picked across all slots). If
 * `budget` is provided, no candidate is returned that would exceed it given
 * `spent` — this keeps per-item re-rolls consistent with the template budget.
 */
export function rerollSlotItem(
	slot: TemplateSlot,
	kaljakori: Kaljakori,
	options: TemplateOptions & { budget?: number; spent?: number } = {}
): SlotResolution {
	let candidates = findCandidates(slot, kaljakori).filter((item) => {
		if (item[AllColumns.RemovedFromSelection]) return false;
		if (options.exclude?.has(item[AllColumns.Number])) return false;
		if (options.storeName) {
			const stores = item[AllColumns.StoreAvailability];
			if (!(stores instanceof Set) || !stores.has(options.storeName)) return false;
		}
		if (
			options.budget !== undefined &&
			(options.spent ?? 0) + (Number(item[AllColumns.Price]) || 0) > options.budget
		)
			return false;
		return true;
	});

	if (slot.pick === 'cheapest') {
		candidates.sort((a, b) => Number(a[AllColumns.Price]) - Number(b[AllColumns.Price]));
	} else if (slot.pick === 'best-value') {
		candidates.sort(
			(a, b) =>
				Number(b[AllColumns.AlcoholGramsPerEuro]) - Number(a[AllColumns.AlcoholGramsPerEuro])
		);
	} else {
		candidates = shuffle(candidates);
	}

	const picked = candidates.slice(0, slot.quantity);
	return {
		slot,
		picked,
		reason:
			picked.length < slot.quantity
				? options.budget !== undefined
					? 'budget'
					: 'no-matches'
				: undefined
	};
}

/** Resolve a template and materialize it as a regular, editable list. */
export function createListFromTemplate(
	template: ListTemplate,
	kaljakori: Kaljakori,
	options: TemplateOptions = {}
): { list: ListObj; resolution: TemplateResolution } {
	const resolution = resolveTemplate(template, kaljakori, options);
	const list = createList(template.name);
	for (const slot of resolution.slots) {
		for (const item of slot.picked) {
			addToList(list, item[AllColumns.Number]);
		}
	}
	return { list, resolution };
}
