import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

type Manifest = {
	datasetVersion: string;
	catalogCapturedOn: string;
	files: { file: string; gzip: string; bytes: number; sha256: string }[];
};

const bundle = new URL('../../data/history-preview/', import.meta.url);
const output = new URL('../../static/', import.meta.url);
const manifest: Manifest = JSON.parse(await readFile(new URL('manifest.json', bundle), 'utf8'));
const expectedFiles = ['data.json', 'history-preview.json', 'availability.json', 'og-images.json'];

// Validate every bundled asset before replacing any local runtime data.
if (
	manifest.files.length !== expectedFiles.length ||
	!expectedFiles.every((file) => manifest.files.some((entry) => entry.file === file))
) {
	throw new Error('The historical-price bundle is missing a required asset.');
}
const files = await Promise.all(
	manifest.files.map(async (entry) => {
		if (entry.gzip !== `${entry.file}.gz`) throw new Error(`Invalid bundle asset: ${entry.file}`);
		const bytes = gunzipSync(await readFile(new URL(entry.gzip, bundle)));
		if (
			bytes.length !== entry.bytes ||
			createHash('sha256').update(bytes).digest('hex') !== entry.sha256
		) {
			throw new Error(`Historical-price bundle verification failed: ${entry.file}`);
		}
		return { name: entry.file, bytes };
	})
);

await mkdir(output, { recursive: true });
for (const file of files) await writeFile(new URL(file.name, output), file.bytes);

console.log(
	`Historical-price working set ${manifest.datasetVersion} restored to ${fileURLToPath(output)}.`
);
console.log(`Catalog and availability captured on ${manifest.catalogCapturedOn}.`);
