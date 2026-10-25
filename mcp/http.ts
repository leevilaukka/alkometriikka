#!/usr/bin/env bun
/**
 * Alkometriikka MCP server over Streamable HTTP, for hosting it (e.g. on a Raspberry Pi behind
 * a Cloudflare Tunnel).
 *
 *   bun run mcp:http
 *
 * Stateless: every request gets its own server and transport, while the catalog is shared and
 * refreshed by the same `CatalogProvider` as for stdio. Environment variables, besides the ones
 * in config.ts:
 *
 * - `PORT`  port to listen on (default 8787)
 * - `HOST`  address to bind (default 127.0.0.1; use 0.0.0.0 to be reachable from other machines)
 */
// The shared web app code logs whole datasets with console.log; keep that out of the service log.
const debug = Boolean(process.env.ALKOMETRIIKKA_MCP_DEBUG);
console.log = console.info = console.debug = debug ? console.error : () => {};

const { WebStandardStreamableHTTPServerTransport } =
	await import('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js');
const { loadConfig } = await import('./config.ts');
const { CatalogProvider } = await import('./provider.ts');
const { createServer } = await import('./server.ts');

const provider = new CatalogProvider(loadConfig());
const MCP_PATH = '/mcp';

async function handleMcp(request: Request): Promise<Response> {
	const server = createServer(provider);
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true
	});
	await server.connect(transport);
	try {
		return await transport.handleRequest(request);
	} finally {
		// The response is complete (JSON mode), so the per-request server can go.
		void server.close();
	}
}

const http = Bun.serve({
	port: Number(process.env.PORT) || 8787,
	hostname: process.env.HOST || '127.0.0.1',
	async fetch(request) {
		const { pathname } = new URL(request.url);
		if (pathname === '/health') return new Response('ok');
		if (pathname !== MCP_PATH) return new Response('Not found', { status: 404 });
		try {
			return await handleMcp(request);
		} catch (error) {
			console.error('[alkometriikka-mcp] Request failed:', error);
			return new Response('Internal server error', { status: 500 });
		}
	}
});
console.error(`[alkometriikka-mcp] Listening on http://${http.hostname}:${http.port}${MCP_PATH}`);

// Warm the catalog so the first request is fast.
provider.get().catch((error) => {
	console.error(
		'[alkometriikka-mcp] Could not load catalog:',
		error instanceof Error ? error.message : error
	);
});

export {};
