import type { PriceListItem } from '$lib/types';
import { AllColumns as C } from './constants.ts';

const collator = Intl.Collator.supportedLocalesOf(['fi']).length
	? new Intl.Collator('fi', { usage: 'search', sensitivity: 'base', ignorePunctuation: false })
	: null;

function text(value: unknown): string {
	const out = String(value ?? '')
		.normalize('NFKC')
		.toLowerCase()
		.replace(/\s+/gu, ' ')
		.trim();
	return /^(null|undefined|ei määritelty)$/.test(out) ? '' : out;
}

function number(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value !== 'string' || !/^\d+(?:[.,]\d+)?$/.test(value.trim())) return null;
	const parsed = Number(value.trim().replace(',', '.'));
	return Number.isFinite(parsed) ? parsed : null;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function equalVolume(a: number, b: number): boolean {
	return Math.abs(a - b) < 0.000001;
}

function compareNames(a: string, b: string): number {
	return collator?.compare(a, b) ?? (a < b ? -1 : a > b ? 1 : 0);
}

function lowerBound<T>(items: readonly T[], target: string, name: (item: T) => string): number {
	let low = 0;
	let high = items.length;
	while (low < high) {
		const mid = (low + high) >>> 1;
		if (compareNames(name(items[mid]), target) < 0) low = mid + 1;
		else high = mid;
	}
	return low;
}

function sameName(a: string, b: string): boolean {
	if (!a || !b) return false;
	const left = a.split(' ');
	const right = b.split(' ');
	return (
		left.length === right.length &&
		left.every((token, i) =>
			/\p{N}/u.test(token + right[i]) ? token === right[i] : compareNames(token, right[i]) === 0
		)
	);
}

function normalizeName(product: PriceListItem, volume: number | null) {
	let name = text(product[C.Name]);
	const packaging = text(product[C.PackagingType]);
	const counts = new Set<number>();
	if (packaging && packaging !== 'muu') {
		name = name.replace(
			new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(packaging)}(?![\\p{L}\\p{N}])`, 'gu'),
			' '
		);
	}
	name = name.replace(
		/(?<![\p{L}\p{N}.,])(\d+)\s*[-–]?\s*pack(?![\p{L}\p{N}])/gu,
		(match, count: string) => {
			const parsed = Number(count);
			if (!Number.isSafeInteger(parsed) || parsed < 1) return match;
			counts.add(parsed);
			return ' ';
		}
	);
	const units: Record<string, number> = { l: 1, cl: 0.01, ml: 0.001 };
	name = name.replace(
		/(?<![\p{L}\p{N}.,])(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(ml|cl|l)(?![\p{L}\p{N}])/gu,
		(match, count: string, size: string, unit: string) => {
			const parsedCount = Number(count);
			const total = parsedCount * Number(size.replace(',', '.')) * units[unit];
			if (
				volume === null ||
				parsedCount < 1 ||
				!Number.isSafeInteger(parsedCount) ||
				!equalVolume(total, volume)
			)
				return match;
			counts.add(parsedCount);
			return ' ';
		}
	);
	const packCount = counts.size > 1 ? null : ([...counts][0] ?? 1);
	name = name.replace(
		/(?<![\p{L}\p{N}.,])(\d+(?:[.,]\d+)?)\s*(ml|cl|l)(?![\p{L}\p{N}])/gu,
		(match, size: string, unit: string) => {
			const litres = Number(size.replace(',', '.')) * units[unit];
			return volume !== null &&
				packCount !== null &&
				(equalVolume(litres, volume) || equalVolume(litres * packCount, volume))
				? ' '
				: match;
		}
	);
	const abv = number(product[C.AlcoholPercentage]);
	name = name.replace(
		/(?<![\p{L}\p{N}.,])(\d+(?:[.,]\d+)?)\s*%(?![\p{L}\p{N}])/gu,
		(match, percentage: string) => (number(percentage) === abv && abv !== null ? ' ' : match)
	);
	const vintage = text(product[C.Vintage]);
	if (/^\d{4}$/.test(vintage)) {
		name = name.replace(new RegExp(`(?<![\\p{L}\\p{N}])${vintage}(?![\\p{L}\\p{N}])`, 'gu'), ' ');
	}
	// A bare trailing decimal may repeat the ABV. Integers can be ages or brand names.
	name = name.replace(/(?<![\p{L}\p{N}.,])(\d+[.,]\d+)\s*$/u, (match, percentage: string) =>
		number(percentage) === abv && abv !== null ? ' ' : match
	);
	return { name: text(name.replace(/\(\s*\)|\[\s*\]/g, ' ')), packCount };
}

export function getComparableProductName(product: PriceListItem): string {
	return normalizeName(product, number(product[C.BottleSize])).name;
}

function descriptors(value: unknown): string[] {
	const entries = value instanceof Set ? [...value] : Array.isArray(value) ? value : [value];
	return [
		...new Set(entries.flatMap((entry) => text(entry).split(/[,.;]\s*/u)).filter(Boolean))
	].sort();
}

type Identity = {
	product: PriceListItem;
	name: string;
	base: string;
	suffix: string;
	abv: number | null;
	vintage: string;
	country: string;
	type: string;
	subtype: string;
	style: string;
	maker: string;
	volume: number | null;
	packaging: string;
	packCount: number | null;
	beer: boolean;
	description: string[];
	measurements: (number | null)[];
};

function identity(product: PriceListItem, declaredSize: boolean): Identity {
	const parsedSize = number(product[C.BottleSize]);
	const volume = declaredSize && parsedSize !== null && parsedSize > 0 ? parsedSize : null;
	const { name, packCount } = normalizeName(product, volume);
	const type = text(product[C.Type]);
	const subtype = text(product[C.SubType]);
	const beer = [type, subtype].some(
		(value) => value === 'oluet' || value === 'alkoholittomat oluet'
	);
	const country = text(product[C.Country]);
	const style = text(product[C.BeerType]);
	// Only a candidate interpretation. The fallback also requires matching measurements
	// and descriptors, and rejects competing suffix identities in the entire group.
	const suffix =
		beer && country === 'suomi' && style === 'lager'
			? /^(\S(?:.*\S)?)\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x)(?:\s+([ab]))?$/.exec(name)
			: null;
	return {
		product,
		name,
		base: suffix?.[1] ?? name,
		suffix: suffix ? `${suffix[2]}${suffix[3] ?? ''}` : '',
		abv: number(product[C.AlcoholPercentage]),
		vintage: text(product[C.Vintage]),
		country,
		type,
		subtype,
		style,
		maker: text(product[C.Manufacturer]),
		volume,
		packaging: text(product[C.PackagingType]),
		packCount,
		beer,
		description: descriptors(product[C.Description]),
		measurements: [C.OriginalGravity, C.BitternessEBU, C.Energy].map((column) =>
			number(product[column])
		)
	};
}

function compatibleMetadata(a: Identity, b: Identity): boolean {
	if (a.abv === null || a.abv < 0 || a.abv > 100 || a.abv !== b.abv || a.vintage !== b.vintage)
		return false;
	if (!a.country || a.country !== b.country || !a.type || !b.type) return false;
	// Compare the same category level, including the old category/subtype hierarchy.
	const categoryMatches =
		a.type === b.type
			? !a.subtype || !b.subtype || a.subtype === b.subtype
			: a.type === b.subtype || b.type === a.subtype;
	if (!categoryMatches) return false;
	return !(a.beer && b.beer && a.style && b.style && a.style !== b.style);
}

function differentPackage(a: Identity, b: Identity): boolean {
	if (a.volume === null || b.volume === null || a.packCount === null || b.packCount === null)
		return false;
	return (
		!equalVolume(a.volume, b.volume) ||
		a.packCount !== b.packCount ||
		(!!a.packaging &&
			!!b.packaging &&
			a.packaging !== 'muu' &&
			b.packaging !== 'muu' &&
			a.packaging !== b.packaging)
	);
}

function sameBeerEvidence(a: Identity, b: Identity): boolean {
	return (
		a.beer &&
		b.beer &&
		a.country === 'suomi' &&
		b.country === 'suomi' &&
		a.style === 'lager' &&
		b.style === 'lager' &&
		!!a.maker &&
		a.maker === b.maker &&
		compatibleMetadata(a, b) &&
		a.measurements.every(
			(value, i) => value !== null && value > 0 && value === b.measurements[i]
		) &&
		a.description.length >= 4 &&
		a.description.length === b.description.length &&
		a.description.every((value, i) => value === b.description[i])
	);
}

/** A snapshot of a loaded catalogue. Rebuild when product data changes; sorting is harmless. */
export class ProductVariantIndex {
	private readonly byId = new Map<string, Identity>();
	private readonly blocks = new Map<string, Identity[]>();
	private readonly genericWords: string[];

	constructor(products: readonly PriceListItem[], declaredSizes: ReadonlySet<PriceListItem>) {
		const genericWords = new Set<string>();
		for (const product of products) {
			const entry = identity(product, declaredSizes.has(product));
			this.byId.set(product[C.Number], entry);
			const key = this.blockKey(entry);
			const block = this.blocks.get(key) ?? [];
			block.push(entry);
			this.blocks.set(key, block);
			for (const label of [
				entry.type,
				entry.subtype,
				entry.style,
				...descriptors(product[C.GrapeVarieties])
			]) {
				for (const token of label.split(/[^\p{L}\p{N}]+/u)) if (token) genericWords.add(token);
			}
		}
		for (const block of this.blocks.values()) block.sort((a, b) => compareNames(a.base, b.base));
		this.genericWords = [...genericWords].sort(compareNames);
	}

	private blockKey(entry: Identity): string {
		return JSON.stringify([entry.abv, entry.vintage]);
	}

	private candidates(target: Identity): Identity[] {
		const block = this.blocks.get(this.blockKey(target)) ?? [];
		const low = lowerBound(block, target.base, (entry) => entry.base);
		const result: Identity[] = [];
		for (let i = low; i < block.length && compareNames(block[i].base, target.base) === 0; i++) {
			if (sameName(block[i].base, target.base)) result.push(block[i]);
		}
		return result;
	}

	private ordinaryMatch(a: Identity, b: Identity): boolean {
		if (!sameName(a.name, b.name) || !compatibleMetadata(a, b)) return false;
		if (a.maker && a.maker === b.maker) return true;
		// A name consisting only of catalogue categories/grapes is not enough to
		// establish identity across different or missing producers (e.g. "Merlot").
		return a.name.split(/[^\p{L}\p{N}]+/u).some((word) => {
			const position = lowerBound(this.genericWords, word, (value) => value);
			return word.length >= 3 && compareNames(this.genericWords[position] ?? '', word) !== 0;
		});
	}

	private suffixMatch(a: Identity, b: Identity, group: Identity[]): boolean {
		if (!!a.suffix === !!b.suffix || !sameBeerEvidence(a, b)) return false;
		const marked = a.suffix ? a : b;
		// Check before excluding same-size products, and never merge two editions
		// indirectly through an unmarked product.
		return !group.some(
			(entry) => entry.suffix && entry.suffix !== marked.suffix && sameBeerEvidence(marked, entry)
		);
	}

	find(product: PriceListItem): PriceListItem[] {
		const target = this.byId.get(product[C.Number]);
		if (!target?.name || target.volume === null) return [];
		const group = this.candidates(target);
		return group
			.filter(
				(entry) =>
					entry.product[C.Number] !== product[C.Number] &&
					(this.ordinaryMatch(target, entry) || this.suffixMatch(target, entry, group)) &&
					differentPackage(target, entry)
			)
			.sort(
				(a, b) =>
					a.volume! - b.volume! ||
					compareNames(a.packaging, b.packaging) ||
					(a.product[C.Number] < b.product[C.Number] ? -1 : 1)
			)
			.map((entry) => entry.product);
	}
}
