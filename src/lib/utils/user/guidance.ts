/**
 * Guidance for new visitors: the front page intro and hints shown where a feature gets used.
 * Each piece shows once, and only to visitors first seen after it shipped, so regulars never get it.
 */
export const GuidanceIds = {
	/** One line on the front page saying how the list is ordered */
	Intro: 'intro',
	/** The store filter, which narrows the list to one Alko's selection */
	StoreFilter: 'store_filter'
} as const;
export type GuidanceId = (typeof GuidanceIds)[keyof typeof GuidanceIds];

export type GuidanceState = {
	/** Local date (YYYY-MM-DD) the visitor was first seen */
	firstSeen: string;
	/** Used the site before guidance shipped, so gets none */
	returning?: boolean;
	/** Closed, or no longer needed because the feature got used */
	seen: GuidanceId[];
};

/** Days after the first visit that the front page intro is offered for */
export const INTRO_DAYS = 7;

/** The saved state, or a new one for a visitor seen for the first time today */
export function initGuidance(
	saved: GuidanceState | null,
	today: string,
	usedBefore: boolean
): GuidanceState {
	if (saved && typeof saved.firstSeen === 'string' && Array.isArray(saved.seen)) return saved;
	return usedBefore
		? { firstSeen: today, returning: true, seen: [] }
		: { firstSeen: today, seen: [] };
}

function daysBetween(from: string, to: string) {
	return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export function shouldShowGuidance(state: GuidanceState, id: GuidanceId, today: string) {
	if (state.returning || state.seen.includes(id)) return false;
	// Someone still coming back after a week has found their way around
	if (id === GuidanceIds.Intro) return daysBetween(state.firstSeen, today) < INTRO_DAYS;
	return true;
}
