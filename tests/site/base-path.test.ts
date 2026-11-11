import { describe, expect, it } from 'bun:test';
import { Glob } from 'bun';
import path from 'node:path';

/**
 * Branch previews build the site under a sub-path (BASE_PATH=/feat-x), so
 * internal links, navigations and fetches must go through resolve() / asset()
 * (or appPath() for plain strings) instead of hardcoding a leading "/".
 * A hardcoded "/listat" works on alkometriikka.fi but jumps out of a preview.
 */
const SRC = path.join(import.meta.dir, '../../src');

const RULES: { name: string; pattern: RegExp }[] = [
	{ name: 'href="/…"', pattern: /href="\/(?!\/)/ },
	{ name: 'href={`/…`}', pattern: /href=\{`\/(?!\/)/ },
	{ name: "goto('/…')", pattern: /goto\(['"`]\// },
	{ name: "fetch('/…')", pattern: /fetch\(['"`]\// },
	{ name: "redirect(…, '/…')", pattern: /redirect\(\d+,\s*['"`]\// }
];

describe('base path', () => {
	it('has no hardcoded root-relative links in src', async () => {
		const offenders: string[] = [];
		for await (const file of new Glob('**/*.{svelte,ts}').scan(SRC)) {
			const lines = (await Bun.file(path.join(SRC, file)).text()).split('\n');
			lines.forEach((line, i) => {
				for (const rule of RULES) {
					if (rule.pattern.test(line)) offenders.push(`src/${file}:${i + 1} ${rule.name}`);
				}
			});
		}
		expect(offenders).toEqual([]);
	});
});
