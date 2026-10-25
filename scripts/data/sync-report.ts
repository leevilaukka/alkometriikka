/**
 * Machine-readable record of one sync attempt, for build monitoring.
 *
 * When `ALKO_SYNC_REPORT` names a file, the sync appends one JSON line per
 * attempt to it on exit, whatever the exit path. fetchData.yml retries the
 * sync up to three times, so the file ends up with one line per attempt and
 * `scripts/ci/run-report.ts` ships them with the run's record.
 */
import { appendFileSync } from 'node:fs';

export interface SyncStats {
	unchanged: number;
	updated: number;
	added: number;
	removed: number;
	failed: number;
	filtered: number;
	filteredRemoved: number;
	verified: number;
	verifyFailed: number;
}

/** How an attempt ended. Anything not set explicitly (a crash, an unexpected exit) is `error`. */
export type SyncOutcome =
	| 'synced'
	| 'incomplete_fetch'
	| 'empty_fetch'
	| 'stores_failed'
	| 'no_existing_dataset'
	| 'safeguards_rejected'
	| 'error';

export interface SyncAttemptReport {
	/** `ALKO_SYNC_ATTEMPT`, set by the workflow's retry loop. */
	attempt: number | null;
	startedAt: string;
	durationMs: number;
	exitCode: number;
	outcome: SyncOutcome;
	forced: boolean;
	/** Distinct products the search API returned, and the total it advertised. */
	apiProducts: number | null;
	expectedTotal: number | null;
	existingProducts: number | null;
	stores: number | null;
	/** Products in the written dataset. */
	totalProducts: number | null;
	hasChanges: boolean | null;
	stats: SyncStats | null;
	phasesMs: { fetch?: number; details?: number; verify?: number; write?: number };
	safeguardProblems: string[];
	error: string | null;
}

export function createSyncReport(forced: boolean, attempt = Number(process.env.ALKO_SYNC_ATTEMPT)) {
	const report: SyncAttemptReport = {
		attempt: Number.isInteger(attempt) && attempt > 0 ? attempt : null,
		startedAt: new Date().toISOString(),
		durationMs: 0,
		exitCode: 0,
		outcome: 'error',
		forced,
		apiProducts: null,
		expectedTotal: null,
		existingProducts: null,
		stores: null,
		totalProducts: null,
		hasChanges: null,
		stats: null,
		phasesMs: {},
		safeguardProblems: [],
		error: null
	};
	return report;
}

/** Milliseconds since `start` (a `performance.now()` reading), rounded. */
export function elapsedMs(start: number): number {
	return Math.round(performance.now() - start);
}

/**
 * Appends the finished report as one JSON line. Synchronous so it works from a
 * `process.on('exit')` handler, and never throws: monitoring must not change
 * how the sync exits.
 */
export function appendSyncReport(path: string, report: SyncAttemptReport, exitCode: number): void {
	try {
		report.exitCode = exitCode;
		report.durationMs = Date.now() - Date.parse(report.startedAt);
		appendFileSync(path, `${JSON.stringify(report)}\n`);
	} catch (error) {
		console.warn(`⚠️  Could not write the sync report to ${path}:`, error);
	}
}

/** Parses a report file written by {@link appendSyncReport}, skipping unreadable lines. */
export function parseSyncReports(text: string): SyncAttemptReport[] {
	const reports: SyncAttemptReport[] = [];
	for (const line of text.split('\n')) {
		if (!line.trim()) continue;
		try {
			reports.push(JSON.parse(line) as SyncAttemptReport);
		} catch {
			// A line cut short by a killed process; the other attempts still count.
		}
	}
	return reports;
}
