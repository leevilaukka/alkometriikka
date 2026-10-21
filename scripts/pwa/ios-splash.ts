import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { format, resolveConfig } from 'prettier';

/**
 * Launch screens for the app installed on iOS. iOS ignores the manifest's splash colours and
 * shows white until the page paints, unless it finds an `apple-touch-startup-image` matching
 * the exact screen size, orientation and colour scheme. Each image is the first frame of
 * #main-loader in src/app.html, so the splash hands over to the live loader without a jump.
 *
 * Writes the images to static/ios/splash/, and into src/app.html between the `iOS splash screens`
 * markers a script that adds their link tags on iPhones and iPads only. As plain tags they'd add
 * ~21 KB to every prerendered page (~300 MB across the site) for something only iOS reads.
 * Rerun when Apple ships a new screen size or the loader changes:
 *
 *     bun run pwa:splash
 */

const ROOT = path.join(import.meta.dir, '..', '..');
const OUT_DIR = path.join(ROOT, 'static/ios/splash');
const APP_HTML = path.join(ROOT, 'src/app.html');
const LOGO_SVG = path.join(ROOT, 'static/images/loader-logo.svg');

const START_MARKER = '<!-- iOS splash screens start (bun run pwa:splash) -->';
const END_MARKER = '<!-- iOS splash screens end -->';

/** Portrait CSS size and pixel ratio of each iPhone and iPad screen; models sharing one are listed once */
const SCREENS: { width: number; height: number; ratio: number; devices: string }[] = [
	{ width: 440, height: 956, ratio: 3, devices: 'iPhone 16/17 Pro Max' },
	{ width: 420, height: 912, ratio: 3, devices: 'iPhone Air' },
	{ width: 402, height: 874, ratio: 3, devices: 'iPhone 16/17 Pro, 17' },
	{ width: 430, height: 932, ratio: 3, devices: 'iPhone 14 Pro Max, 15/16 Plus, 15 Pro Max' },
	{ width: 393, height: 852, ratio: 3, devices: 'iPhone 14 Pro, 15, 15 Pro, 16' },
	{ width: 428, height: 926, ratio: 3, devices: 'iPhone 12/13 Pro Max, 14 Plus' },
	{ width: 390, height: 844, ratio: 3, devices: 'iPhone 12, 13, 14, 16e' },
	{ width: 375, height: 812, ratio: 3, devices: 'iPhone X, XS, 11 Pro, 12/13 mini' },
	{ width: 414, height: 896, ratio: 3, devices: 'iPhone XS Max, 11 Pro Max' },
	{ width: 414, height: 896, ratio: 2, devices: 'iPhone XR, 11' },
	{ width: 414, height: 736, ratio: 3, devices: 'iPhone 6–8 Plus' },
	{ width: 375, height: 667, ratio: 2, devices: 'iPhone 6–8, SE 2/3' },
	{ width: 320, height: 568, ratio: 2, devices: 'iPhone SE' },
	{ width: 1032, height: 1376, ratio: 2, devices: 'iPad Pro 13" (M4)' },
	{ width: 1024, height: 1366, ratio: 2, devices: 'iPad Pro 12.9", iPad Air 13"' },
	{ width: 834, height: 1210, ratio: 2, devices: 'iPad Pro 11" (M4)' },
	{ width: 834, height: 1194, ratio: 2, devices: 'iPad Pro 11"' },
	{ width: 820, height: 1180, ratio: 2, devices: 'iPad Air 11", iPad 10th/11th gen' },
	{ width: 834, height: 1112, ratio: 2, devices: 'iPad Air 10.5"' },
	{ width: 810, height: 1080, ratio: 2, devices: 'iPad 10.2"' },
	{ width: 768, height: 1024, ratio: 2, devices: 'iPad mini 5, iPad 9.7"' },
	{ width: 744, height: 1133, ratio: 2, devices: 'iPad mini 6/7' }
];

// The loader's colours and proportions, from src/app.html
const BAR_COLORS = ['rgb(229, 27, 21)', 'rgb(191, 22, 22)', 'rgb(150, 15, 15)'];
const BOTTLE_COLOR = BAR_COLORS[1];
const SCHEMES = {
	light: { background: '#ffffff', logo: 'rgb(150, 15, 15)' },
	dark: { background: 'rgb(82, 0, 10)', logo: '#ffffff' }
} as const;
const BOTTLE_PATH =
	'M341.34,376.9v550.32H0V376.9c0-60.39,31.37-113.45,78.7-143.79,15.25-9.77,24.63-26.48,24.63-44.58V0h134.68v188.53c0,18.11,9.39,34.81,24.63,44.58,47.33,30.34,78.7,83.4,78.7,143.79Z';
const BOTTLE_RATIO = 341.34 / 927.22;
const LOGO_RATIO = 263.28 / 69.19;
/** #loader-header img: 4.5rem at the 14px root size */
const LOGO_HEIGHT = 4.5 * 14;
/** The bars' row is 55% of the bottle; each bar swings between 20% and 100% of that */
const BARS_HEIGHT = 0.55;
/** A fixed frame of the bars' animation, so reruns produce identical images */
const BAR_FRAME = [0.8, 0.5, 1, 0.65, 0.9, 0.45, 0.75];

/** The left side runs outward from the bottle and starts with the brightest red, the right with the darkest */
function barColor(index: number, side: 'left' | 'right') {
	const n = index + 1;
	const step = n % 3 === 0 ? 2 : n % 2 === 0 ? 1 : 0;
	return side === 'left' ? BAR_COLORS[step] : BAR_COLORS[2 - step];
}

function splashSvg(width: number, height: number, logo: string, scheme: keyof typeof SCHEMES) {
	const colors = SCHEMES[scheme];
	const bottleHeight = height / 3;
	const bottleWidth = bottleHeight * BOTTLE_RATIO;
	const bottleX = (width - bottleWidth) / 2;
	const barsHeight = bottleHeight * BARS_HEIGHT;
	const barCount = Math.ceil(bottleX / bottleWidth);

	const bars: string[] = [];
	for (const side of ['left', 'right'] as const) {
		for (let i = 0; i < barCount; i++) {
			const barHeight =
				barsHeight * BAR_FRAME[(i * 2 + (side === 'right' ? 1 : 0)) % BAR_FRAME.length];
			const x = side === 'left' ? bottleX - (i + 1) * bottleWidth : bottleX + bottleWidth * (i + 1);
			bars.push(
				`<rect x="${x}" y="${height - barHeight}" width="${bottleWidth}" height="${barHeight}" fill="${barColor(i, side)}"/>`
			);
		}
	}

	// The header fills the space above the bottle and centres the logo in it
	const logoWidth = LOGO_HEIGHT * LOGO_RATIO;
	const logoX = (width - logoWidth) / 2;
	const logoY = (height - bottleHeight - LOGO_HEIGHT) / 2;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${colors.background}"/>
<svg x="${logoX}" y="${logoY}" width="${logoWidth}" height="${LOGO_HEIGHT}" viewBox="0 0 263.28 69.19" fill="${colors.logo}">${logo}</svg>
${bars.join('\n')}
<svg x="${bottleX}" y="${height - bottleHeight}" width="${bottleWidth}" height="${bottleHeight}" viewBox="0 0 341.34 927.22"><path d="${BOTTLE_PATH}" fill="${BOTTLE_COLOR}"/></svg>
</svg>`;
}

const logoSource = await readFile(LOGO_SVG, 'utf8');
// Its <style> picks the fill by colour scheme, which resvg can't evaluate, so only the shapes are kept
const logo = logoSource
	.replace(/^[\s\S]*?<svg[^>]*>/, '')
	.replace(/<\/svg>\s*$/, '')
	.replace(/<style>[\s\S]*?<\/style>/, '');

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

for (const screen of SCREENS) {
	for (const orientation of ['portrait', 'landscape'] as const) {
		const [width, height] =
			orientation === 'portrait' ? [screen.width, screen.height] : [screen.height, screen.width];
		for (const scheme of Object.keys(SCHEMES) as (keyof typeof SCHEMES)[]) {
			const png = new Resvg(splashSvg(width, height, logo, scheme), {
				fitTo: { mode: 'zoom', value: screen.ratio }
			})
				.render()
				.asPng();
			await writeFile(path.join(OUT_DIR, splashFile(screen, orientation, scheme)), png);
		}
	}
}

function splashFile(
	screen: (typeof SCREENS)[number],
	orientation: 'portrait' | 'landscape',
	scheme: string
) {
	const [width, height] =
		orientation === 'portrait' ? [screen.width, screen.height] : [screen.height, screen.width];
	return `${width * screen.ratio}x${height * screen.ratio}-${scheme}.png`;
}

// Must name the same files as splashFile(). iPadOS reports itself as a Mac, told apart by touch
const screenList = SCREENS.map(({ width, height, ratio }) => `${width}x${height}x${ratio}`).join(
	' '
);
const script = `<script>
	// Launch screens for the app installed on iOS; other browsers never use them
	if (/iP(hone|ad|od)/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
		const screens = '${screenList}';
		for (const screen of screens.split(' ')) {
			const [width, height, ratio] = screen.split('x').map(Number);
			for (const orientation of ['portrait', 'landscape']) {
				const [w, h] = orientation === 'portrait' ? [width, height] : [height, width];
				for (const scheme of ['light', 'dark']) {
					const link = document.createElement('link');
					link.rel = 'apple-touch-startup-image';
					// device-width and device-height stay the portrait values in landscape
					link.media = \`(device-width: \${width}px) and (device-height: \${height}px) and (-webkit-device-pixel-ratio: \${ratio}) and (orientation: \${orientation}) and (prefers-color-scheme: \${scheme})\`;
					link.href = \`%sveltekit.assets%/ios/splash/\${w * ratio}x\${h * ratio}-\${scheme}.png\`;
					document.head.append(link);
				}
			}
		}
	}
</script>`;

const html = await readFile(APP_HTML, 'utf8');
const start = html.indexOf(START_MARKER);
const end = html.indexOf(END_MARKER);
if (start === -1 || end === -1) throw new Error(`Add the splash screen markers to ${APP_HTML}`);
const updated = html.slice(0, start + START_MARKER.length) + '\n' + script + '\n' + html.slice(end);
// Indents and wraps the script the way the repo's Prettier wants it
const prettierConfig = await resolveConfig(APP_HTML);
await writeFile(APP_HTML, await format(updated, { ...prettierConfig, filepath: APP_HTML }));

console.log(
	`Wrote ${SCREENS.length * 4} splash screens to ${path.relative(ROOT, OUT_DIR)} and their script to src/app.html`
);
