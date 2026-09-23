/**
 * The date Daily launched (Europe/Helsinki), i.e. day #1. Fixed forever once
 * live — never change this, or every later day's number shifts.
 */
export const DAILY_LAUNCH_DATE = '2026-09-22';

/**
 * 1-indexed count of Daily days, including `date` itself, since launch.
 * Pure date arithmetic so every caller (client, OG card, prerendered stub)
 * agrees without needing to read the archive index, which only grows once a
 * day finishes and briefly lags right after midnight.
 */
export function dayNumberForDate(date: string): number {
	const [launchYear, launchMonth, launchDay] = DAILY_LAUNCH_DATE.split('-').map(Number);
	const [year, month, day] = date.split('-').map(Number);
	const days = Math.round(
		(Date.UTC(year!, month! - 1, day!) - Date.UTC(launchYear!, launchMonth! - 1, launchDay!)) /
			86_400_000
	);
	return days + 1;
}
