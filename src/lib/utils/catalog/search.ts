export function isSimilarString(s1: string, s2: string, threshold: number = 0.4) {
	const longerLength = Math.max(s1.length, s2.length);
	if (longerLength == 0) return 1.0 > threshold;
	// Same result as `similarity(s1, s2) > threshold`, but stops computing the edit
	// distance once it is too large for the strings to count as similar.
	const cap = Math.ceil(longerLength * (1 - threshold));
	const distance = boundedEditDistance(s1.toLowerCase(), s2.toLowerCase(), cap);
	return (longerLength - distance) / longerLength > threshold;
}

let previousRow = new Int32Array(64);
let currentRow = new Int32Array(64);

/** Levenshtein distance, or `cap + 1` as soon as it is known to exceed `cap`. */
function boundedEditDistance(a: string, b: string, cap: number) {
	if (Math.abs(a.length - b.length) > cap) return cap + 1;
	if (previousRow.length <= b.length) {
		previousRow = new Int32Array(b.length + 1);
		currentRow = new Int32Array(b.length + 1);
	}
	let previous = previousRow;
	let current = currentRow;
	for (let j = 0; j <= b.length; j++) previous[j] = j;
	for (let i = 1; i <= a.length; i++) {
		current[0] = i;
		let rowMin = i;
		const char = a.charCodeAt(i - 1);
		for (let j = 1; j <= b.length; j++) {
			const substitution = previous[j - 1] + (char === b.charCodeAt(j - 1) ? 0 : 1);
			const value = Math.min(substitution, previous[j] + 1, current[j - 1] + 1);
			current[j] = value;
			if (value < rowMin) rowMin = value;
		}
		if (rowMin > cap) return cap + 1;
		[previous, current] = [current, previous];
	}
	return previous[b.length];
}

export function similarity(s1: string, s2: string) {
	let longer = s1;
	let shorter = s2;
	if (s1.length < s2.length) {
		longer = s2;
		shorter = s1;
	}
	let longerLength = longer.length;
	if (longerLength == 0) {
		return 1.0;
	}
	return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength.toString());
}

export function editDistance(s1: string, s2: string) {
	s1 = s1.toLowerCase();
	s2 = s2.toLowerCase();

	let costs = new Array();
	for (let i = 0; i <= s1.length; i++) {
		let lastValue = i;
		for (let j = 0; j <= s2.length; j++) {
			if (i == 0) costs[j] = j;
			else {
				if (j > 0) {
					let newValue = costs[j - 1];
					if (s1.charAt(i - 1) != s2.charAt(j - 1))
						newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
					costs[j - 1] = lastValue;
					lastValue = newValue;
				}
			}
		}
		if (i > 0) costs[s2.length] = lastValue;
	}
	return costs[s2.length];
}
