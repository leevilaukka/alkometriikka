export type OptionLeaf = {
	type: 'option';
	value: string;
	/** Text shown for the option inside its group, e.g. "Arkadia" for "Helsinki keskusta Arkadia" */
	label: string;
};

export type OptionGroup = {
	type: 'group';
	/** Unique key of the group, the words leading to it joined with spaces, e.g. "Helsinki keskusta" */
	key: string;
	/** Text shown for the group inside its parent, e.g. "keskusta" */
	label: string;
	children: OptionNode[];
	/** Every option value under the group, nested groups included */
	values: string[];
};

export type OptionNode = OptionLeaf | OptionGroup;

type Entry = { value: string; words: string[] };

/**
 * Groups options by their leading words, e.g. store names by city and then by
 * district: "Helsinki keskusta Arkadia" goes under "Helsinki" → "keskusta".
 * Words that only one option has stay ungrouped, and the original option order
 * is kept (groups take the place of their first option).
 *
 * @param maxDepth How many levels of groups to make at most
 */
export function groupOptionsByWords(options: string[], maxDepth = 2): OptionNode[] {
	const entries = options.map((value) => ({ value, words: value.split(/\s+/).filter(Boolean) }));
	return groupEntries(entries, 0, maxDepth, []);
}

function groupEntries(
	entries: Entry[],
	depth: number,
	maxDepth: number,
	path: string[]
): OptionNode[] {
	const buckets = new Map<string, Entry[]>();
	const order: (Entry | string)[] = [];
	for (const entry of entries) {
		// The entry has no word left on this level (e.g. "Kaarina" in the "Kaarina" group)
		// or there are no more levels to make
		if (depth >= maxDepth || entry.words.length <= depth) {
			order.push(entry);
			continue;
		}
		const word = entry.words[depth];
		const bucket = buckets.get(word);
		if (bucket) bucket.push(entry);
		else {
			buckets.set(word, [entry]);
			order.push(word);
		}
	}

	return order.map((item): OptionNode => {
		if (typeof item !== 'string') return leaf(item, depth);
		const bucket = buckets.get(item)!;
		if (bucket.length === 1) return leaf(bucket[0], depth);
		const groupPath = [...path, item];
		let group: OptionGroup = {
			type: 'group',
			key: groupPath.join(' '),
			label: item,
			children: groupEntries(bucket, depth + 1, maxDepth, groupPath),
			values: bucket.map((entry) => entry.value)
		};
		// A group holding just one sub group, e.g. "Hyvinkää" → "Willa", reads better as one
		// "Hyvinkää Willa" group
		while (group.children.length === 1 && group.children[0].type === 'group') {
			const only: OptionGroup = group.children[0];
			group = { ...only, label: `${group.label} ${only.label}` };
		}
		return group;
	});
}

function leaf(entry: Entry, depth: number): OptionLeaf {
	return {
		type: 'option',
		value: entry.value,
		label: entry.words.slice(depth).join(' ') || entry.value
	};
}
