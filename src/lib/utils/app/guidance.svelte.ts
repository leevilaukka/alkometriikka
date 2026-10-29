import { LocalStorageKeys } from '$lib/utils/constants/app';
import { LocalStorageManager } from '$lib/utils/app/storage';
import {
	initGuidance,
	shouldShowGuidance,
	type GuidanceId,
	type GuidanceState
} from '$lib/utils/user/guidance';

const today = new Date().toLocaleDateString('sv-SE');
const saved = LocalStorageManager.getItem(LocalStorageKeys.Guidance);

// Signs of a visit before guidance shipped. The layout saves several settings on every load, even
// empty, so only content the visitor made counts. The install banner logs today on load too.
function usedBefore() {
	const nonEmpty = (value: unknown[] | null) => (value?.length ?? 0) > 0;
	const installDays = LocalStorageManager.getItem(LocalStorageKeys.InstallBanner)?.days ?? [];
	return (
		installDays.some((day) => day !== today) ||
		nonEmpty(LocalStorageManager.getItem(LocalStorageKeys.Lists)) ||
		nonEmpty(LocalStorageManager.getItem(LocalStorageKeys.Watchlist)) ||
		nonEmpty(LocalStorageManager.getItem(LocalStorageKeys.CompareProducts)) ||
		nonEmpty(LocalStorageManager.getItem(LocalStorageKeys.DismissedNotices)) ||
		nonEmpty(LocalStorageManager.getItem(LocalStorageKeys.ViewedShares)) ||
		LocalStorageManager.getItem(LocalStorageKeys.DailyStreak) !== null
	);
}

let state = $state<GuidanceState>(initGuidance(saved, today, !saved && usedBefore()));
// Saved right away, so a new visitor stays new once the signs above appear on later days
if (!saved) LocalStorageManager.setItem(LocalStorageKeys.Guidance, state);

export const guidance = {
	shows(id: GuidanceId) {
		return shouldShowGuidance(state, id, today);
	},
	/** Closed, or no longer needed because the feature got used */
	dismiss(id: GuidanceId) {
		if (state.seen.includes(id)) return;
		state = { ...state, seen: [...state.seen, id] };
		LocalStorageManager.setItem(LocalStorageKeys.Guidance, state);
	}
};
