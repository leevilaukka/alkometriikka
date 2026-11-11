/**
 * Records one workflow run as a JSON object in R2, for the build monitoring
 * dashboards (Grafana on the Umami Pi pulls the objects from the bucket).
 *
 * Runs in a final `report` job of each deploying workflow, after the other
 * jobs, so their timings and step results can be read from the GitHub API.
 * fetchData.yml also passes the sync's per-attempt report (sync-report.ts).
 *
 * Keys sort by time, `ci-runs/v1/YYYY/MM/DD/HHMMSS-<workflow>-<run>-<attempt>.json`,
 * so a reader can fetch everything new with one ListObjects `start-after` call.
 * A record is never overwritten: a re-run is a new attempt, and so a new key.
 *
 * Best-effort: any failure is logged and the script still exits 0, so
 * monitoring can never fail a deploy.
 *
 * Usage:
 *   bun run scripts/ci/run-report.ts --status success
 *   RUN_NEEDS='${{ toJSON(needs) }}' bun run scripts/ci/run-report.ts [--sync-report sync-report.ndjson]
 *   ... --out record.json   (also write the record locally)
 */
import { existsSync, readFileSync } from 'node:fs';
import { R2S3Client } from '../r2/client';
import { readOption } from '../lib/cli';
import { parseSyncReports, type SyncAttemptReport } from '../data/sync-report';
import { DEFAULT_BUCKET } from '../site/backup-archive';

export const RECORD_VERSION = 1;
export const KEY_PREFIX = `ci-runs/v${RECORD_VERSION}/`;

export type RunStatus = 'success' | 'failure' | 'cancelled';

export interface StepRecord {
	name: string;
	conclusion: string | null;
	durationSeconds: number | null;
}

export interface JobRecord {
	name: string;
	conclusion: string | null;
	startedAt: string | null;
	completedAt: string | null;
	durationSeconds: number | null;
	steps: StepRecord[];
}

export interface RunRecord {
	version: typeof RECORD_VERSION;
	repository: string;
	/** Workflow file name without extension, e.g. `fetchData`. */
	workflow: string;
	workflowName: string;
	runId: number;
	runAttempt: number;
	runUrl: string;
	event: string;
	sha: string;
	ref: string;
	status: RunStatus;
	startedAt: string | null;
	reportedAt: string;
	durationSeconds: number | null;
	jobs: JobRecord[];
	/** `job › step` for every failed step, including `continue-on-error` ones. */
	failedSteps: string[];
	/** One entry per sync attempt (fetchData only). */
	sync: SyncAttemptReport[] | null;
}

interface ApiStep {
	name: string;
	conclusion: string | null;
	started_at: string | null;
	completed_at: string | null;
}

interface ApiJob {
	name: string;
	conclusion: string | null;
	started_at: string | null;
	completed_at: string | null;
	steps?: ApiStep[];
}

/** Overall result from `toJSON(needs)`: any failed job fails the run, then any cancelled one. */
export function statusFromNeeds(needs: Record<string, { result?: string }>): RunStatus {
	const results = Object.values(needs).map((need) => need.result);
	if (results.includes('failure')) return 'failure';
	if (results.includes('cancelled')) return 'cancelled';
	return 'success';
}

export function parseStatus(value: string | undefined): RunStatus | null {
	return value === 'success' || value === 'failure' || value === 'cancelled' ? value : null;
}

/** `owner/repo/.github/workflows/fetchData.yml@refs/heads/main` -> `fetchData`. */
export function workflowSlug(workflowRef: string | undefined, workflowName: string): string {
	const fromRef = workflowRef?.match(/\/([^/@]+)\.ya?ml@/)?.[1];
	if (fromRef) return fromRef;
	return workflowName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workflow';
}

export function objectKey(
	record: Pick<RunRecord, 'reportedAt' | 'workflow' | 'runId' | 'runAttempt'>
) {
	const [date, time] = record.reportedAt.split('T') as [string, string];
	const [year, month, day] = date.split('-');
	const hhmmss = time.slice(0, 8).replaceAll(':', '');
	return `${KEY_PREFIX}${year}/${month}/${day}/${hhmmss}-${record.workflow}-${record.runId}-${record.runAttempt}.json`;
}

function secondsBetween(start: string | null, end: string | null): number | null {
	if (!start || !end) return null;
	const seconds = (Date.parse(end) - Date.parse(start)) / 1000;
	return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : null;
}

/** Jobs still running (the report job itself) are timed up to `reportedAt`. */
export function toJobRecords(jobs: ApiJob[], reportedAt: string): JobRecord[] {
	return jobs.map((job) => ({
		name: job.name,
		conclusion: job.conclusion,
		startedAt: job.started_at,
		completedAt: job.completed_at,
		durationSeconds: secondsBetween(job.started_at, job.completed_at ?? reportedAt),
		steps: (job.steps ?? []).map((step) => ({
			name: step.name,
			conclusion: step.conclusion,
			durationSeconds: secondsBetween(step.started_at, step.completed_at)
		}))
	}));
}

export function failedSteps(jobs: JobRecord[]): string[] {
	return jobs.flatMap((job) => {
		const steps = job.steps.filter((step) => step.conclusion === 'failure');
		if (steps.length > 0) return steps.map((step) => `${job.name} › ${step.name}`);
		return job.conclusion === 'failure' ? [job.name] : [];
	});
}

async function githubApi<T>(path: string): Promise<T | null> {
	const base = process.env.GITHUB_API_URL ?? 'https://api.github.com';
	const token = process.env.GITHUB_TOKEN;
	try {
		const response = await fetch(`${base}${path}`, {
			headers: {
				Accept: 'application/vnd.github+json',
				...(token ? { Authorization: `Bearer ${token}` } : {})
			}
		});
		if (!response.ok) {
			console.warn(`⚠️  GitHub API ${path} returned ${response.status}`);
			return null;
		}
		return (await response.json()) as T;
	} catch (error) {
		console.warn(`⚠️  GitHub API ${path} failed:`, error);
		return null;
	}
}

function readSyncReports(path: string | undefined): SyncAttemptReport[] | null {
	if (!path) return null;
	if (!existsSync(path)) {
		console.warn(`ℹ️  No sync report at ${path} (the sync never ran or wrote one).`);
		return [];
	}
	return parseSyncReports(readFileSync(path, 'utf8'));
}

async function buildRecord(): Promise<RunRecord> {
	const env = process.env;
	const repository = env.GITHUB_REPOSITORY ?? '';
	const runId = Number(env.GITHUB_RUN_ID) || 0;
	const runAttempt = Number(env.GITHUB_RUN_ATTEMPT) || 1;
	const workflowName = env.GITHUB_WORKFLOW ?? '';
	const reportedAt = new Date().toISOString();

	const status =
		parseStatus(readOption('--status')) ??
		(env.RUN_NEEDS ? statusFromNeeds(JSON.parse(env.RUN_NEEDS)) : null);
	if (!status) throw new Error('Pass --status success|failure|cancelled, or RUN_NEEDS.');

	let startedAt: string | null = null;
	let jobs: JobRecord[] = [];
	if (repository && runId) {
		const [run, jobList] = await Promise.all([
			githubApi<{ run_started_at?: string }>(`/repos/${repository}/actions/runs/${runId}`),
			githubApi<{ jobs: ApiJob[] }>(
				`/repos/${repository}/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`
			)
		]);
		startedAt = run?.run_started_at ?? null;
		jobs = toJobRecords(jobList?.jobs ?? [], reportedAt);
	}

	return {
		version: RECORD_VERSION,
		repository,
		workflow: workflowSlug(env.GITHUB_WORKFLOW_REF, workflowName),
		workflowName,
		runId,
		runAttempt,
		runUrl: `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}/actions/runs/${runId}/attempts/${runAttempt}`,
		event: env.GITHUB_EVENT_NAME ?? '',
		sha: env.GITHUB_SHA ?? '',
		ref: env.GITHUB_REF_NAME ?? '',
		status,
		startedAt,
		reportedAt,
		durationSeconds: secondsBetween(startedAt, reportedAt),
		jobs,
		failedSteps: failedSteps(jobs),
		sync: readSyncReports(readOption('--sync-report'))
	};
}

async function main(): Promise<void> {
	const record = await buildRecord();
	const key = objectKey(record);
	const body = JSON.stringify(record);
	console.log(
		`📝 ${record.workflow} run ${record.runId}/${record.runAttempt}: ${record.status}` +
			(record.durationSeconds !== null ? ` in ${record.durationSeconds} s` : '') +
			(record.failedSteps.length > 0 ? `, failed: ${record.failedSteps.join('; ')}` : '')
	);

	const outFile = readOption('--out');
	if (outFile) await Bun.write(outFile, JSON.stringify(record, null, '\t'));

	const { CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY, CF_R2_ACCOUNT_ID } = process.env;
	if (!CF_R2_ACCESS_KEY_ID || !CF_R2_SECRET_ACCESS_KEY || !CF_R2_ACCOUNT_ID) {
		console.warn('ℹ️  R2 credentials not set; the run was not recorded.');
		return;
	}
	const bucket = process.env.CF_R2_BUCKET || DEFAULT_BUCKET;
	const client = new R2S3Client({
		accessKeyId: CF_R2_ACCESS_KEY_ID,
		secretAccessKey: CF_R2_SECRET_ACCESS_KEY,
		accountId: CF_R2_ACCOUNT_ID,
		bucket,
		region: process.env.CF_R2_REGION
	});
	await client.putObject(key, body, { type: 'application/json' });
	console.log(`✅ Recorded as ${bucket}/${key} (${body.length} bytes)`);
}

if (import.meta.main) {
	try {
		await main();
	} catch (error) {
		console.warn('⚠️  Could not record the run:', error);
	}
}
