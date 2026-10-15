/**
 * Pure helpers for building the value translation files (see labels.ts): pairing the Finnish
 * labels of Alko's search and detail payloads with the same payloads in another language.
 *
 * Labels are paired per product, not per id: some ids carry several labels (selectionType_001
 * is both "vakiovalikoima" and "kausituote"), and only the product tells which one goes with
 * which translation.
 */

/** `prefix|id|label` entries, the format most search API list fields use. */
export function parseTriples(value: unknown): [string, string][] {
	const entries = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
	const pairs: [string, string][] = [];
	for (const entry of entries) {
		if (typeof entry !== 'string') continue;
		const [, id, label] = entry.split('|');
		if (id?.trim() && label?.trim()) pairs.push([id.trim(), label.trim()]);
	}
	return pairs;
}

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Every id → label a search product carries, across the translated enum-like fields. */
export function searchLabels(product: Record<string, unknown>): Map<string, string> {
	const labels = new Map<string, string>();
	const add = (dimension: string, pairs: [string, string][]) => {
		for (const [id, label] of pairs) labels.set(`${dimension}:${id}`, label);
	};
	add('mainGroup', parseTriples(product.mainGroups));
	const groupIds = strings(product.productGroupId);
	const groupNames = strings(product.productGroupName);
	add(
		'productGroup',
		groupIds.map((id, i) => [id.trim(), (groupNames[i] ?? '').trim()] as [string, string])
	);
	add('country', parseTriples(product.country));
	add('tasteStyle', parseTriples(product.tasteStyles));
	add('packageType', parseTriples(product.packageTypes));
	add('closure', parseTriples(product.closures));
	add('selection', parseTriples(product.selectionTypes));
	add('certificate', parseTriples(product.certificateClass));
	return labels;
}

/** Splits Alko's comma separated taste words, e.g. "Punainen, kuiva, tanniininen". */
export function splitWords(value: unknown): string[] {
	return typeof value === 'string'
		? value
				.split(',')
				.map((word) => word.trim())
				.filter(Boolean)
		: [];
}

/** Splits a set column the way the app does (src/lib/alko/index.ts): on ". " and ", ". */
export function splitSet(value: unknown): string[] {
	return typeof value === 'string'
		? value
				.split(/[.,]\s/)
				.map((part) => part.trim())
				.filter(Boolean)
		: [];
}

/** The key a Finnish value is looked up with in the app (src/lib/i18n/values.ts). */
export function labelKey(value: string): string {
	return value.trim().toLowerCase();
}

/**
 * Counts how often each Finnish value is paired with each translation, so the most common
 * pairing wins when Alko isn't consistent.
 */
export class PairCounter {
	private counts = new Map<string, Map<string, number>>();

	add(finnish: string | undefined, translated: string | undefined) {
		if (!finnish?.trim() || !translated?.trim()) return;
		const key = labelKey(finnish);
		const byTranslation = this.counts.get(key) ?? new Map<string, number>();
		const value = translated.trim();
		byTranslation.set(value, (byTranslation.get(value) ?? 0) + 1);
		this.counts.set(key, byTranslation);
	}

	/** Pairs aligned by position, when both lists are the same length (taste words, notes). */
	addAligned(finnish: string[], translated: string[]) {
		if (finnish.length !== translated.length) return;
		finnish.forEach((word, i) => this.add(word, translated[i]));
	}

	/**
	 * For word lists of different lengths: once the other words have known translations, the one
	 * Finnish word left over goes with the translated words left over. Those can be several when
	 * Alko's translation itself has a comma ("paahteinen" → "toasted, roasted"), so adjacent
	 * leftovers are joined back together. Call after the aligned pass, so the known translations
	 * come from the products whose lists did line up.
	 */
	addByElimination(finnish: string[], translated: string[]) {
		if (finnish.length === translated.length || !finnish.length) return;
		const known = this.result();
		// Known translations can span several items too, so match them as comma separated runs
		const used = new Set<number>();
		const unknown: string[] = [];
		for (const word of finnish) {
			const translation = known[labelKey(word)];
			if (translation === undefined) {
				unknown.push(word);
				continue;
			}
			const parts = splitWords(translation).map(labelKey);
			const start = translated.findIndex((_, i) =>
				parts.every((part, j) => labelKey(translated[i + j] ?? '') === part && !used.has(i + j))
			);
			if (start >= 0) parts.forEach((_, j) => used.add(start + j));
		}
		const left = translated.map((_, i) => i).filter((i) => !used.has(i));
		const adjacent = left.every((index, i) => i === 0 || index === left[i - 1] + 1);
		if (unknown.length !== 1 || !left.length || !adjacent) return;
		this.add(unknown[0], left.map((i) => translated[i]).join(', '));
	}

	has(finnish: string): boolean {
		return this.counts.has(labelKey(finnish));
	}

	/**
	 * The most common translation of each value. Values that read the same in both languages are
	 * kept too, so the next run knows they were checked and doesn't fetch them again.
	 */
	result(): Record<string, string> {
		const out: Record<string, string> = {};
		for (const [key, byTranslation] of this.counts) {
			const [best] = [...byTranslation].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
			if (best) out[key] = best[0];
		}
		return out;
	}
}

/** The region part of the dataset's `Alue` ("Champagne - AC Champagne" → "Champagne"). */
export function regionLabel(value: unknown): string | undefined {
	if (typeof value !== 'string' || !value.trim()) return undefined;
	return value.split(' - ')[0]?.trim() || undefined;
}

/** The region label of a detail payload's production sites (scripts/data/constants.ts). */
export function detailRegionLabel(sites: unknown): string | undefined {
	if (!Array.isArray(sites)) return undefined;
	const region = sites.find(
		(site) =>
			site &&
			typeof site === 'object' &&
			(site as { searchParams?: { regionId?: unknown } }).searchParams?.regionId != null
	) as { label?: unknown } | undefined;
	return typeof region?.label === 'string' ? region.label.trim() || undefined : undefined;
}

/** Sorted copy of a record, so the files diff cleanly between runs. */
export function sortRecord(record: Record<string, string>): Record<string, string> {
	return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}
