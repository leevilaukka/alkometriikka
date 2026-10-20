// Ranking for the Ctrl+K command palette. Kept free of `$lib` state imports so it can be unit tested.

/** Lowercases and strips diacritics so "vakevat" finds "Väkevät". */
export function normalizeSearchText(value: string): string {
	return value
		.toLocaleLowerCase('fi-FI')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

const WORD_BOUNDARY = /[\s\-–(/,.&'"]/;

function isWordStart(text: string, index: number): boolean {
	return index === 0 || WORD_BOUNDARY.test(text[index - 1]);
}

/**
 * How well a normalized `query` matches a normalized `text`, 0 meaning no match.
 * Exact > prefix > word prefix > substring > every word found somewhere.
 */
export function matchScore(query: string, text: string): number {
	if (!query || !text) return 0;
	if (text === query) return 100;
	if (text.startsWith(query)) return 80;

	const index = text.indexOf(query);
	if (index > 0) return isWordStart(text, index) ? 65 : 45;

	const tokens = query.split(' ');
	if (tokens.length < 2) return 0;
	let wordStarts = 0;
	for (const token of tokens) {
		const at = text.indexOf(token);
		if (at === -1) return 0;
		if (isWordStart(text, at)) wordStarts++;
	}
	return 25 + (15 * wordStarts) / tokens.length;
}

export type SearchEntry<T> = {
	value: T;
	/** Normalized texts to match against, most important first. Later keys weigh less. */
	keys: string[];
	/** Exact identifiers (product number, EAN) that match only by prefix. */
	ids?: string[];
	/** Added to the score of a match, negative to push an entry down. */
	boost?: number;
};

export type RankedEntry<T> = { value: T; score: number };

const SECONDARY_KEY_WEIGHT = 0.7;

export function scoreEntry<T>(query: string, entry: SearchEntry<T>): number {
	let best = 0;
	entry.keys.forEach((key, i) => {
		const score = matchScore(query, key) * (i === 0 ? 1 : SECONDARY_KEY_WEIGHT);
		if (score > best) best = score;
	});
	for (const id of entry.ids ?? []) {
		if (id === query) best = Math.max(best, 100);
		else if (query.length >= 3 && id.startsWith(query)) best = Math.max(best, 70);
	}
	if (best === 0) return 0;
	// Prefer shorter texts on ties: "Koskenkorva" before "Koskenkorva Vodka Salmiakki"
	const tieBreak = 1 - Math.min(entry.keys[0]?.length ?? 0, 100) / 100;
	return best + (entry.boost ?? 0) + tieBreak;
}

/** Best `limit` entries for `query` (already normalized), highest score first. */
export function rankEntries<T>(
	query: string,
	entries: SearchEntry<T>[],
	limit: number
): RankedEntry<T>[] {
	if (!query) return [];
	const top: RankedEntry<T>[] = [];
	for (const entry of entries) {
		const score = scoreEntry(query, entry);
		if (score <= 0) continue;
		if (top.length === limit && score <= top[top.length - 1].score) continue;
		// Insert keeping `top` sorted; limits are small so a linear insert beats sorting everything
		let i = top.length;
		while (i > 0 && top[i - 1].score < score) i--;
		top.splice(i, 0, { value: entry.value, score });
		if (top.length > limit) top.pop();
	}
	return top;
}

export type SearchScope = 'product' | 'category' | 'store' | 'list' | 'page' | 'action';

/** Typing one of these at the start of the query narrows the search to that scope. */
export const SCOPE_PREFIXES: { prefix: string; scope: SearchScope }[] = [
	{ prefix: 't:', scope: 'product' },
	{ prefix: 'k:', scope: 'category' },
	{ prefix: 'm:', scope: 'store' },
	{ prefix: 'l:', scope: 'list' },
	{ prefix: 's:', scope: 'page' },
	{ prefix: '>', scope: 'action' }
];

/** The scope a query starts with and the query without its prefix, or null when there is none. */
export function parseScopePrefix(query: string): { scope: SearchScope; rest: string } | null {
	const trimmed = query.trimStart();
	const lower = trimmed.toLowerCase();
	for (const { prefix, scope } of SCOPE_PREFIXES) {
		if (lower.startsWith(prefix)) return { scope, rest: trimmed.slice(prefix.length).trimStart() };
	}
	return null;
}
