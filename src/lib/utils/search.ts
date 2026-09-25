export function isSimilarString(s1: string, s2: string, threshold: number = 0.4) {
    const THRESHOLD = threshold;
    return similarity(s1, s2) > THRESHOLD;
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

// Like isSimilarString, but compares whole words instead of characters, so a single
// differing word (e.g. a beer style like "IPA" vs "Lager") isn't diluted by a long
// shared prefix the way it would be with character-level similarity.
export function isSimilarTokenized(s1: string, s2: string, threshold: number = 0.4) {
    const THRESHOLD = threshold;
    return tokenSimilarity(s1, s2) > THRESHOLD;
}

export function tokenSimilarity(s1: string, s2: string) {
    const tokens1 = s1.split(/\s+/).filter(Boolean);
    const tokens2 = s2.split(/\s+/).filter(Boolean);
    let longer = tokens1;
    let shorter = tokens2;
    if (tokens1.length < tokens2.length) {
        longer = tokens2;
        shorter = tokens1;
    }
    const longerLength = longer.length;
    if (longerLength == 0) {
        return 1.0;
    }
    return (longerLength - tokenEditDistance(longer, shorter)) / longerLength;
}

export function tokenEditDistance(tokens1: string[], tokens2: string[]) {
    let costs = new Array();
    for (let i = 0; i <= tokens1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= tokens2.length; j++) {
            if (i == 0)
                costs[j] = j;
            else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (tokens1[i - 1] !== tokens2[j - 1])
                        newValue = Math.min(Math.min(newValue, lastValue),
                            costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0)
            costs[tokens2.length] = lastValue;
    }
    return costs[tokens2.length];
}

export function editDistance(s1: string, s2: string) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();

    let costs = new Array();
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i == 0)
                costs[j] = j;
            else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) != s2.charAt(j - 1))
                        newValue = Math.min(Math.min(newValue, lastValue),
                            costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0)
            costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}