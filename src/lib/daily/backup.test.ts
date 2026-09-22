import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	assertBackupNotShrinking,
	countTarballFiles,
	createArchiveTarball,
	extractArchiveTarball
} from '../../../scripts/site/backup-archive';

describe('daily archive backup', () => {
	it('packs and extracts daily archive files without loss', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'alko-backup-test-'));
		const sourceDir = join(tempDir, 'source');
		const extractDir = join(tempDir, 'extracted');
		mkdirSync(sourceDir, { recursive: true });
		mkdirSync(extractDir, { recursive: true });

		const mockIndex = { version: 1, dates: ['2026-09-21', '2026-09-20'] };
		const mockDay1 = { date: '2026-09-21', game: { questions: [1, 2, 3] } };
		const mockDay2 = { date: '2026-09-20', game: { questions: [4, 5, 6] } };

		writeFileSync(join(sourceDir, 'index.json'), JSON.stringify(mockIndex, null, 2));
		writeFileSync(join(sourceDir, '2026-09-21.json'), JSON.stringify(mockDay1, null, 2));
		writeFileSync(join(sourceDir, '2026-09-20.json'), JSON.stringify(mockDay2, null, 2));

		const { compressed, fileCount, files } = await createArchiveTarball(sourceDir);
		expect(fileCount).toBe(3);
		expect(files).toContain('index.json');
		expect(files).toContain('2026-09-21.json');
		expect(files).toContain('2026-09-20.json');
		expect(compressed.byteLength).toBeGreaterThan(0);

		await extractArchiveTarball(compressed, extractDir);

		const restoredIndex = JSON.parse(readFileSync(join(extractDir, 'index.json'), 'utf8'));
		const restoredDay1 = JSON.parse(readFileSync(join(extractDir, '2026-09-21.json'), 'utf8'));
		const restoredDay2 = JSON.parse(readFileSync(join(extractDir, '2026-09-20.json'), 'utf8'));

		expect(restoredIndex).toEqual(mockIndex);
		expect(restoredDay1).toEqual(mockDay1);
		expect(restoredDay2).toEqual(mockDay2);

		rmSync(tempDir, { recursive: true, force: true });
	});

	it('throws an error if directory does not exist or has no json files', async () => {
		expect(createArchiveTarball('/non/existent/path')).rejects.toThrow('not found');

		const tempDir = mkdtempSync(join(tmpdir(), 'alko-empty-test-'));
		expect(createArchiveTarball(tempDir)).rejects.toThrow('No JSON files found');
		rmSync(tempDir, { recursive: true, force: true });
	});

	it('counts tarball files and refuses to shrink an existing backup', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'alko-backup-test-'));
		writeFileSync(join(tempDir, 'index.json'), '{}');
		writeFileSync(join(tempDir, '2026-09-21.json'), '{}');
		const { compressed } = await createArchiveTarball(tempDir);
		expect(await countTarballFiles(compressed)).toBe(2);
		rmSync(tempDir, { recursive: true, force: true });

		expect(() => assertBackupNotShrinking(40, 2)).toThrow('Refusing to overwrite backup');
		expect(() => assertBackupNotShrinking(40, 40)).not.toThrow();
		expect(() => assertBackupNotShrinking(40, 41)).not.toThrow();
	});
});
