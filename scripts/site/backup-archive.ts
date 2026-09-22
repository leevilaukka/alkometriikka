/**
 * Backs up the Alkometriikka Daily archive to Cloudflare R2 as a compressed tarball (.tar.gz).
 *
 * Runs as part of the daily archiving workflow to preserve historical finished
 * daily games in object storage independently of GitHub repository history.
 *
 * Overwrites `daily-archive.tar.gz` in R2 on each backup run.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { R2S3Client } from '../r2/client';

export const DEFAULT_BACKUP_KEY = 'daily-archive.tar.gz';
export const DEFAULT_BUCKET = 'alkometriikka-og';

/** Reads command-line option value (e.g. `--out backup.tar.gz` -> `backup.tar.gz`). */
export function readOption(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

/**
 * Creates a gzipped tarball from all files in the given directory using `Bun.Archive`.
 */
export async function createArchiveTarball(dirPath: string): Promise<{
	compressed: Uint8Array;
	fileCount: number;
	rawBytes: number;
	files: string[];
}> {
	if (!existsSync(dirPath)) {
		throw new Error(`Archive directory not found at ${dirPath}`);
	}

	const fileNames = readdirSync(dirPath).filter((file) => file.endsWith('.json'));
	if (fileNames.length === 0) {
		throw new Error(`No JSON files found in archive directory ${dirPath}`);
	}

	const fileMap: Record<string, string> = {};
	for (const fileName of fileNames) {
		const filePath = join(dirPath, fileName);
		fileMap[fileName] = readFileSync(filePath, 'utf8');
	}

	const archive = new Bun.Archive(fileMap);
	const tarBytes = await archive.bytes();
	const compressed = Bun.gzipSync(tarBytes);

	return {
		compressed,
		fileCount: fileNames.length,
		rawBytes: tarBytes.byteLength,
		files: fileNames
	};
}

/**
 * Extracts a gzipped tarball to a destination folder using `Bun.Archive`.
 */
export async function extractArchiveTarball(
	tarGzBytes: Uint8Array,
	destinationDir: string
): Promise<void> {
	const uncompressed = Bun.gunzipSync(tarGzBytes as unknown as ArrayBuffer);
	const archive = new Bun.Archive(uncompressed as unknown as ArrayBuffer);
	await archive.extract(destinationDir);
}

async function main(): Promise<void> {
	const dev = process.argv.includes('--dev');
	const defaultDir = dev ? './static/daily/archive' : './daily/archive';
	const archiveDir = readOption('--dir') ?? defaultDir;
	const outFile = readOption('--out');
	const targetBucket =
		readOption('--bucket') ??
		process.env.CF_R2_BACKUP_BUCKET ??
		process.env.CF_R2_BUCKET ??
		DEFAULT_BUCKET;
	const backupKey = readOption('--key') ?? process.env.CF_R2_BACKUP_KEY ?? DEFAULT_BACKUP_KEY;

	console.log(`📦 Creating daily archive backup from ${archiveDir}...`);
	const { compressed, fileCount, rawBytes } = await createArchiveTarball(archiveDir);
	console.log(
		`🗜️  Packed ${fileCount} file(s): ${(rawBytes / 1024).toFixed(1)} KB tar → ${(compressed.byteLength / 1024).toFixed(1)} KB gzipped`
	);

	if (outFile) {
		await Bun.write(outFile, compressed);
		console.log(`💾 Saved local backup to ${outFile}`);
	}

	const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
	const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
	const accountId = process.env.CF_R2_ACCOUNT_ID;
	const region = process.env.CF_R2_REGION;

	if (accessKeyId && secretAccessKey && accountId) {
		const client = new R2S3Client({
			accessKeyId,
			secretAccessKey,
			accountId,
			bucket: targetBucket,
			region
		});

		console.log(`☁️  Uploading backup to R2 bucket "${targetBucket}" as "${backupKey}"...`);
		await client.putObject(backupKey, compressed, { type: 'application/gzip' });
		console.log(`✅ Daily archive backup uploaded successfully to R2 (${backupKey})`);
	} else if (!outFile) {
		console.warn(
			'ℹ️  R2 credentials not set (CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY, CF_R2_ACCOUNT_ID); skipped cloud upload.'
		);
	}
}

if (import.meta.main) {
	await main();
}
