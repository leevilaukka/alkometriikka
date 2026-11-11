import path from 'node:path';
import Bun from 'bun';
import { readOption } from '../lib/cli';
import { ROUTE_PRELOADS_FILE, type RouteAssets, type RoutePreloads } from '../lib/stub';

/**
 * Records the JS chunks and stylesheets of each page route (from SvelteKit's build output) in
 * `route-preloads.json` next to the site. The page shell only preloads the root layout's code,
 * so a stub for a deeper page lists its route's own code too (see `renderStub`), and the browser
 * fetches it with the shell instead of only after the app starts. The file is deployed with the
 * site, so stubs re-rendered later against the deployed shell (fetchData.yml) can read it.
 */

const outputPath = path.resolve(readOption('--out') ?? 'build');
const serverPath = path.resolve(readOption('--server') ?? '.svelte-kit/output/server');

function readArray(source: string, name: string): string[] {
	const match = source.match(new RegExp(`export const ${name} = (\\[[^\\]]*\\]);`));
	return match ? (JSON.parse(match[1]) as string[]) : [];
}

const nodes = new Map<number, RouteAssets>();
async function readNode(index: number): Promise<RouteAssets> {
	let node = nodes.get(index);
	if (!node) {
		const source = await Bun.file(path.join(serverPath, 'nodes', `${index}.js`)).text();
		node = { imports: readArray(source, 'imports'), stylesheets: readArray(source, 'stylesheets') };
		nodes.set(index, node);
	}
	return node;
}

// Each page route's entry in SvelteKit's manifest, e.g.
// `id: "/tuotteet/[...id]", pattern: …, params: […], page: { layouts: [0,], errors: [1,], leaf: 19 }`
const manifest = await Bun.file(path.join(serverPath, 'manifest-full.js')).text();
const routes = manifest.matchAll(
	/id: "([^"]+)",\s*pattern:.*\n\s*params:.*\n\s*page: \{ layouts: \[([^\]]*)\], errors: \[([^\]]*)\], leaf: (\d+) \}/g
);

const preloads: RoutePreloads = {};
for (const [, id, layouts, errors, leaf] of routes) {
	// The app loads the route's layouts and error pages with it; stubs leave out what the shell
	// already loads (the root layout)
	const indexes = [...`${layouts},${errors}`.split(',').filter(Boolean).map(Number), Number(leaf)];
	const assets = await Promise.all(indexes.map(readNode));
	preloads[id] = {
		imports: [...new Set(assets.flatMap((node) => node.imports))],
		stylesheets: [...new Set(assets.flatMap((node) => node.stylesheets))]
	};
}
if (!Object.keys(preloads).length) throw new Error(`No page routes found in ${serverPath}`);

const target = path.join(outputPath, ROUTE_PRELOADS_FILE);
await Bun.write(target, JSON.stringify(preloads));
console.log(`✅ Wrote preloads for ${Object.keys(preloads).length} routes to ${target}`);
