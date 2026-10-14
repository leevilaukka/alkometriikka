import { describe, expect, test } from 'bun:test';
import {
	failedSteps,
	objectKey,
	parseStatus,
	statusFromNeeds,
	toJobRecords,
	workflowSlug
} from '../../scripts/ci/run-report';
import { createSyncReport, parseSyncReports } from '../../scripts/data/sync-report';

describe('statusFromNeeds', () => {
	test('a failed job fails the run, even next to a cancelled one', () => {
		expect(statusFromNeeds({ sync: { result: 'cancelled' }, deploy: { result: 'failure' } })).toBe(
			'failure'
		);
	});

	test('a cancelled job cancels the run', () => {
		expect(statusFromNeeds({ sync: { result: 'success' }, deploy: { result: 'cancelled' } })).toBe(
			'cancelled'
		);
	});

	test('skipped jobs alongside successes are a success', () => {
		expect(statusFromNeeds({ sync: { result: 'success' }, deploy: { result: 'skipped' } })).toBe(
			'success'
		);
	});
});

test('parseStatus accepts only job statuses', () => {
	expect(parseStatus('failure')).toBe('failure');
	expect(parseStatus('skipped')).toBeNull();
	expect(parseStatus(undefined)).toBeNull();
});

describe('workflowSlug', () => {
	test('uses the workflow file name', () => {
		expect(
			workflowSlug(
				'leevilaukka/alkometriikka/.github/workflows/fetchData.yml@refs/heads/main',
				'Download Price List'
			)
		).toBe('fetchData');
	});

	test('falls back to the slugged workflow name', () => {
		expect(workflowSlug(undefined, 'Download Price List')).toBe('Download-Price-List');
	});
});

test('objectKey sorts by time and is unique per attempt', () => {
	const key = objectKey({
		reportedAt: '2026-10-14T07:05:09.123Z',
		workflow: 'fetchData',
		runId: 123,
		runAttempt: 2
	});
	expect(key).toBe('ci-runs/v1/2026/10/14/070509-fetchData-123-2.json');
	const later = objectKey({
		reportedAt: '2026-10-14T13:00:00.000Z',
		workflow: 'archiveDaily',
		runId: 1,
		runAttempt: 1
	});
	expect(later > key).toBe(true);
});

describe('job records', () => {
	const jobs = toJobRecords(
		[
			{
				name: 'sync',
				conclusion: 'failure',
				started_at: '2026-10-14T00:00:00Z',
				completed_at: '2026-10-14T00:05:00Z',
				steps: [
					{
						name: 'Run tests',
						conclusion: 'success',
						started_at: '2026-10-14T00:00:10Z',
						completed_at: '2026-10-14T00:00:40Z'
					},
					{
						name: 'Run script to convert to JSON',
						conclusion: 'failure',
						started_at: '2026-10-14T00:00:40Z',
						completed_at: '2026-10-14T00:05:00Z'
					}
				]
			},
			{ name: 'deploy', conclusion: 'failure', started_at: null, completed_at: null },
			{
				name: 'report',
				conclusion: null,
				started_at: '2026-10-14T00:06:00Z',
				completed_at: null
			}
		],
		'2026-10-14T00:06:30Z'
	);

	test('times jobs and steps, and running jobs up to the report', () => {
		expect(jobs[0]!.durationSeconds).toBe(300);
		expect(jobs[0]!.steps[1]!.durationSeconds).toBe(260);
		expect(jobs[1]!.durationSeconds).toBeNull();
		expect(jobs[2]!.durationSeconds).toBe(30);
	});

	test('lists failed steps, or the job when no step failed', () => {
		expect(failedSteps(jobs)).toEqual(['sync › Run script to convert to JSON', 'deploy']);
	});
});

test('parseSyncReports keeps every whole attempt line', () => {
	const first = { ...createSyncReport(false, 1), outcome: 'incomplete_fetch' as const };
	const second = { ...createSyncReport(false, 2), outcome: 'synced' as const };
	const text = `${JSON.stringify(first)}\n${JSON.stringify(second)}\n{"attempt":3,"outc`;
	expect(parseSyncReports(text).map((report) => [report.attempt, report.outcome])).toEqual([
		[1, 'incomplete_fetch'],
		[2, 'synced']
	]);
});
