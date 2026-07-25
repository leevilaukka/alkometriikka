export function isSimilarString(s1: string, s2: string, threshold: number = 0.4) {
    const THRESHOLD = threshold;
    return similarity(s1, s2) > THRESHOLD;
}


/**
 * Determines the similarity between two strings using the Levenshtein distance algorithm. The similarity score is calculated as a value between 0 and 1, where 1 indicates identical strings and 0 indicates completely different strings.
 * 
 * Used to allow minor typos in search queries, e.g., "olut" and "oltu" would be considered similar.
 * @param s1 The first string to compare.
 * @param s2 The second string to compare.
 * @returns A similarity score between 0 and 1, representing how similar the two strings are.
 */
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

/**
 * Calculates the edit distance (Levenshtein distance, number of operations needed to transform one string into another) between two strings.
 * @param s1 The first string.
 * @param s2 The second string.
 * @returns The edit distance between the two strings.
 */

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