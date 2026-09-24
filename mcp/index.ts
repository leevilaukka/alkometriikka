#!/usr/bin/env bun
/**
 * Alkometriikka MCP server (stdio transport).
 *
 *   bun run mcp
 *
 * stdout carries the MCP protocol, so console.log / info / debug (used by the
 * shared web app code, e.g. `Kaljakori`) must never write to it. They are
 * silenced, or sent to stderr when ALKOMETRIIKKA_MCP_DEBUG is set. This has to
 * happen before the app modules are loaded, hence the dynamic imports below.
 */
const debug = Boolean(process.env.ALKOMETRIIKKA_MCP_DEBUG);
const toStderr = (...args: unknown[]) => console.error(...args);
const silent = () => {};
console.log = debug ? toStderr : silent;
console.info = debug ? toStderr : silent;
console.debug = debug ? toStderr : silent;

const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { loadConfig } = await import('./config.ts');
const { CatalogProvider } = await import('./provider.ts');
const { createServer } = await import('./server.ts');

const provider = new CatalogProvider(loadConfig());
const server = createServer(provider);
await server.connect(new StdioServerTransport());

// Warm the catalog in the background so the first tool call is fast. Failures
// are reported again (as tool errors) when a tool actually needs the data.
provider.get().catch((error) => {
	console.error(
		'[alkometriikka-mcp] Could not load catalog:',
		error instanceof Error ? error.message : error
	);
});

export {};
