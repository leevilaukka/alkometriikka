import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Bun from 'bun';
import { Resvg } from '@resvg/resvg-js';
import { HOME_PAGE, STATIC_PAGES } from '../../src/lib/utils/app/seo.ts';
import { OG_IMAGE_HEIGHT, OG_IMAGE_WIDTH, loadFavicon } from './og';
import { readOption } from '../lib/cli';
import { readStoredDataset } from '../lib/stored-dataset';

/**
 * Renders the share cards of the static pages (front page, laskin, tilastot, …):
 * cards in the frame of the category and product cards (red edge strip, logo header,
 * heavy title) with a sharp screenshot of the page cropped off the bottom edge. Kept apart from og.ts on purpose — that file's
 * source is hashed into every PRODUCT image key, so editing it would re-render
 * the whole catalog. This is a manual tool, not part of CI: the cards only change
 * when a page's look does, so the PNGs are committed to static/images/og/.
 *
 *   bun run scripts/og/og-static.ts --base http://localhost:4173   # capture + render all
 *   bun run scripts/og/og-static.ts --base ... --only /laskin/     # one page
 *
 * Needs a served build of the site (`bun run build && bunx vite preview --port 4173`)
 * and a `chromium` binary on PATH. Pages that are empty without user data (seuratut, listat,
 * kompassi) get sample localStorage and a fixed location so the screenshot shows real content.
 */

const OUT_DIR = path.join(import.meta.dir, '..', '..', 'static/images/og');
const FONT_DIR = path.join(import.meta.dir, '..', '..', 'src/lib/assets/fonts/Inter/static');
const DATA_FILE = path.join(import.meta.dir, '..', '..', 'static/data.json');
const SHOT_WIDTH = 1440;
const SHOT_HEIGHT = 900;
/** Centred single-column pages, captured at a narrower viewport so the content fills the card. */
const NARROW_PAGES = [
	'/seuratut/',
	'/listat/',
	'/kompassi/',
	'/boolilaskuri/',
	'/laskin/',
	'/myymalat/'
];

type Target = { path: string; slug: string; title: string };

const TARGETS: Target[] = [
	{ path: '/', slug: 'home', title: 'Alkometriikka' },
	...STATIC_PAGES.map((page) => ({
		path: page.path,
		slug: page.path.replaceAll('/', ''),
		title: page.title
	}))
];

/** Browser state a page needs to show something besides its empty state, keyed by localStorage key. */
type Seed = Record<string, unknown>;

type Dataset = { schema?: string[]; products?: Record<string, { values?: unknown[] }> };

const HELSINKI = { latitude: 60.1699, longitude: 24.9384 };

/** Deterministic sample state: a few followed products, a few lists and a known location. */
function seedsFor(dataset: Dataset): Record<string, Seed> {
	const schema = dataset.schema ?? [];
	const priceIndex = schema.indexOf('Hinta');
	const removedIndex = schema.indexOf('Poistunut valikoimasta');
	const sample = Object.entries(dataset.products ?? {})
		.filter(
			([, product]) => !product.values?.[removedIndex] && Number(product.values?.[priceIndex]) > 0
		)
		.filter((_, index) => index % 300 === 0)
		.slice(0, 8)
		.map(([id, product]) => ({ id, price: Number(product.values![priceIndex]) }));
	const now = new Date().toISOString();
	return {
		'/seuratut/': {
			watchlist: sample.slice(0, 4).map(({ id, price }, index) => ({
				id,
				addedAt: now,
				seen: {
					at: now,
					price: Math.round(price * (index % 2 ? 0.88 : 1.14) * 100) / 100,
					removed: false
				}
			}))
		},
		'/listat/': {
			lists: [
				{
					id: '1-a',
					name: 'Viikonloppu',
					items: sample.slice(0, 4).map(({ id }) => ({ id, q: 2 }))
				},
				{
					id: '2-b',
					name: 'Mökkireissu',
					items: sample.slice(2, 7).map(({ id }) => ({ id, q: 3 }))
				},
				{ id: '3-c', name: 'Juhlat', items: sample.slice(4, 8).map(({ id }) => ({ id, q: 6 })) }
			]
		},
		'/kompassi/': { user_location: HELSINKI, user_location_updated_at: Date.now() }
	};
}

/** Minimal Chrome DevTools Protocol client, enough to seed storage and take a screenshot. */
class Chromium {
	private socket!: WebSocket;
	private nextId = 1;
	private pending = new Map<
		number,
		(message: { result?: unknown; error?: { message: string } }) => void
	>();
	private listeners: ((message: { method?: string; sessionId?: string }) => void)[] = [];
	private proc!: ReturnType<typeof Bun.spawn>;

	async start(profileDir: string) {
		const port = 9400 + Math.floor(Math.random() * 400);
		this.proc = Bun.spawn(
			[
				'chromium',
				'--headless=new',
				'--no-sandbox',
				'--disable-gpu',
				'--hide-scrollbars',
				`--remote-debugging-port=${port}`,
				`--user-data-dir=${profileDir}`,
				'about:blank'
			],
			{ stdout: 'ignore', stderr: 'ignore' }
		);
		let wsUrl: string | undefined;
		for (let attempt = 0; attempt < 50 && !wsUrl; attempt += 1) {
			await Bun.sleep(200);
			wsUrl = await fetch(`http://127.0.0.1:${port}/json/version`)
				.then((response) => response.json())
				.then((json: { webSocketDebuggerUrl: string }) => json.webSocketDebuggerUrl)
				.catch(() => undefined);
		}
		if (!wsUrl) throw new Error('chromium did not start');
		this.socket = new WebSocket(wsUrl);
		await new Promise((resolve, reject) => {
			this.socket.onopen = resolve;
			this.socket.onerror = reject;
		});
		this.socket.onmessage = (event) => {
			const message = JSON.parse(String(event.data));
			if (message.id) this.pending.get(message.id)?.(message);
			else for (const listener of this.listeners) listener(message);
		};
	}

	send<T = Record<string, unknown>>(method: string, params: object = {}, sessionId?: string) {
		const id = this.nextId++;
		return new Promise<T>((resolve, reject) => {
			this.pending.set(id, (message) =>
				message.error
					? reject(new Error(`${method}: ${message.error.message}`))
					: resolve(message.result as T)
			);
			this.socket.send(JSON.stringify({ id, method, params, sessionId }));
		});
	}

	/** Opens the page with `seed` in localStorage and the viewport at screenshot size, returns a PNG. */
	async screenshot(url: string, seed: Seed | undefined, width: number): Promise<Uint8Array> {
		const origin = new URL(url).origin;
		const { targetId } = await this.send<{ targetId: string }>('Target.createTarget', {
			url: 'about:blank'
		});
		const { sessionId } = await this.send<{ sessionId: string }>('Target.attachToTarget', {
			targetId,
			flatten: true
		});
		const call = (method: string, params: object = {}) => this.send(method, params, sessionId);
		await call('Page.enable');
		await call('Emulation.setDeviceMetricsOverride', {
			width,
			height: Math.round((width * SHOT_HEIGHT) / SHOT_WIDTH),
			deviceScaleFactor: 2,
			mobile: false
		});
		await this.send('Browser.grantPermissions', { origin, permissions: ['geolocation'] });
		await call('Emulation.setGeolocationOverride', { ...HELSINKI, accuracy: 20 });
		if (seed) {
			const writes = Object.entries(seed)
				.map(
					([key, value]) =>
						`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))});`
				)
				.join('');
			await call('Page.addScriptToEvaluateOnNewDocument', { source: writes });
		}
		const loaded = new Promise<void>((resolve) =>
			this.listeners.push((message) => {
				if (message.sessionId === sessionId && message.method === 'Page.loadEventFired') resolve();
			})
		);
		await call('Page.navigate', { url });
		await loaded;
		await Bun.sleep(5000);
		const { data } = (await call('Page.captureScreenshot', { format: 'png' })) as { data: string };
		await this.send('Target.closeTarget', { targetId });
		return Buffer.from(data, 'base64');
	}

	stop() {
		this.socket?.close();
		this.proc?.kill();
	}
}

function dataUri(mime: string, bytes: Uint8Array | Buffer): string {
	return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}

function escapeXml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** Same frame as the category and product cards: red edge strip, small logo header, heavy ink title. */
function cardSvg(title: string, isHome: boolean, screenshot: string, favicon: string): string {
	const left = 88;
	const shotWidth = OG_IMAGE_WIDTH - left - 72;
	const shotHeight = Math.round((shotWidth * SHOT_HEIGHT) / SHOT_WIDTH);
	const shotTop = 318;
	return `
<svg xmlns="http://www.w3.org/2000/svg" width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" viewBox="0 0 ${OG_IMAGE_WIDTH} ${OG_IMAGE_HEIGHT}">
  <defs>
    <linearGradient id="strip" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e51b15"/>
      <stop offset="1" stop-color="#7a0606"/>
    </linearGradient>
    <clipPath id="round"><rect x="${left}" y="${shotTop}" width="${shotWidth}" height="${shotHeight}" rx="20"/></clipPath>
    <filter id="shadow" x="-5%" y="-10%" width="110%" height="120%"><feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#18181c" flood-opacity="0.14"/></filter>
  </defs>
  <rect width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" fill="#ffffff"/>
  <rect width="24" height="${OG_IMAGE_HEIGHT}" fill="url(#strip)"/>
  ${
		isHome
			? `<image href="${favicon}" x="${left}" y="96" width="132" height="132"/>
  <text x="${left + 132 + 40}" y="162" dominant-baseline="central" font-family="Inter" font-size="104" font-weight="900" letter-spacing="-2" fill="#18181c">Alkometriikka</text>`
			: `<image href="${favicon}" x="${left}" y="52" width="48" height="48"/>
  <text x="${left + 60}" y="76" dominant-baseline="central" font-family="Inter" font-size="26" font-weight="800" letter-spacing="-0.5" fill="#18181c">Alkometriikka</text>
  <text x="${left - 4}" y="230" font-family="Inter" font-size="96" font-weight="900" letter-spacing="-2" fill="#18181c">${escapeXml(title)}</text>`
	}
  <g filter="url(#shadow)"><rect x="${left}" y="${shotTop}" width="${shotWidth}" height="${shotHeight}" rx="20" fill="#ffffff"/></g>
  <g clip-path="url(#round)"><image href="${screenshot}" x="${left}" y="${shotTop}" width="${shotWidth}" height="${shotHeight}"/></g>
  <rect x="${left}" y="${shotTop}" width="${shotWidth}" height="${shotHeight}" rx="20" fill="none" stroke="#ece9e3" stroke-width="2"/>
</svg>`.trim();
}

async function main() {
	const base = (readOption('--base') ?? 'http://localhost:4173').replace(/\/$/, '');
	const only = readOption('--only');
	const targets = only ? TARGETS.filter((target) => target.path === only) : TARGETS;
	if (targets.length === 0) throw new Error(`Unknown page: ${only}`);

	const favicon = await loadFavicon();
	if (!favicon) throw new Error('static/favicon.ico not found');
	const faviconUri = dataUri('image/png', new Uint8Array(favicon));

	await mkdir(OUT_DIR, { recursive: true });
	const scratch = await mkdtemp(path.join(tmpdir(), 'og-static-'));
	const chromium = new Chromium();
	try {
		await chromium.start(path.join(scratch, 'profile'));
		const dataset = (await readStoredDataset<Dataset>(DATA_FILE)) ?? {};
		const seeds = seedsFor(dataset);
		for (const target of targets) {
			const shot = await chromium.screenshot(
				`${base}${target.path}`,
				seeds[target.path],
				NARROW_PAGES.includes(target.path) ? 900 : SHOT_WIDTH
			);
			const svg = cardSvg(
				target.title,
				target.path === '/',
				dataUri('image/png', shot),
				faviconUri
			);
			const png = new Resvg(svg, {
				font: {
					fontFiles: ['Inter_18pt-ExtraBold.ttf', 'Inter_18pt-Black.ttf'].map((file) =>
						path.join(FONT_DIR, file)
					),
					defaultFontFamily: 'Inter'
				}
			})
				.render()
				.asPng();
			const out = path.join(OUT_DIR, `${target.slug}.png`);
			await Bun.write(out, png);
			console.log(`${target.path} → ${path.relative(process.cwd(), out)}`);
		}
	} finally {
		chromium.stop();
		await rm(scratch, { recursive: true, force: true });
	}
}

if (import.meta.main) await main();
