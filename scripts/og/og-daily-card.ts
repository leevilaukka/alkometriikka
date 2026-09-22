import satori from 'satori';
import {
	el,
	INK,
	loadFavicon,
	loadFonts,
	OG_IMAGE_HEIGHT,
	OG_IMAGE_WIDTH,
	ogImageUrl,
	RED,
	SLATE
} from './og';

/**
 * The Daily share card renderer, deliberately kept out of og.ts: that file's
 * entire source is hashed into every PRODUCT image's content-addressed key
 * (see `ogDesignFingerprint` in og.ts), so any edit to it forces a full
 * re-render of the whole product catalog. Iterating on the Daily card's
 * design shouldn't pay that cost, so it lives in its own file that the
 * product fingerprint never reads.
 */

/**
 * The Daily share card is one generic image per calendar day (not
 * personalized per player), so its key is just the date — no content hash
 * needed, since a new day always gets a new key.
 */
export const DAILY_OG_KEY_PREFIX = 'daily';

export function dailyOgKey(date: string): string {
	return `${DAILY_OG_KEY_PREFIX}/${date}.png`;
}

export function dailyOgUrl(date: string): string {
	return ogImageUrl(dailyOgKey(date));
}

export type DailyOgDisplay = {
	/** ISO `YYYY-MM-DD`, Europe/Helsinki. */
	date: string;
	/** 1-indexed count of Daily days published so far, including this one. */
	dayNumber: number;
};

/**
 * `weekday: 'long'` combined with day/month/year in one formatter gives
 * Finnish the inflected "format" form ("keskiviikkona 23.9.2026" — reads as
 * "on Wednesday"). Requesting the weekday on its own instead uses CLDR's
 * "stand-alone" form ("keskiviikko"), which is what a title needs — so this
 * formats the weekday and the date separately and joins them.
 */
function formatDailyDate(date: string): string {
	const parsed = new Date(`${date}T12:00:00`);
	const weekday = new Intl.DateTimeFormat('fi-FI', { weekday: 'long' }).format(parsed);
	const rest = new Intl.DateTimeFormat('fi-FI', {
		day: 'numeric',
		month: 'numeric',
		year: 'numeric'
	}).format(parsed);
	return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${rest}`;
}

/**
 * Renders the generic, non-personalized "today's Daily" share card into a
 * 1200x630 SVG using satori. Unlike the product card, this never varies per
 * player — it's the same image for everyone sharing that day, so it carries
 * no score or grid, only a teaser.
 */
export async function dailyOgSvg(display: DailyOgDisplay): Promise<string> {
	const [fonts, favicon] = await Promise.all([loadFonts(), loadFavicon()]);
	const gridBorder = '#c9c6c0';

	const emptyGrid = el(
		'div',
		{ style: { display: 'flex', flexDirection: 'row', gap: 14 } },
		...Array.from({ length: 7 }, () =>
			el('div', {
				style: { width: 56, height: 56, borderRadius: 10, border: `3px solid ${gridBorder}` }
			})
		)
	);

	const tree = el(
		'div',
		{
			style: {
				width: OG_IMAGE_WIDTH,
				height: OG_IMAGE_HEIGHT,
				display: 'flex',
				flexDirection: 'row',
				backgroundColor: '#ffffff',
				fontFamily: 'Inter'
			}
		},
		el('div', {
			style: {
				width: 24,
				height: '100%',
				flexShrink: 0,
				backgroundImage: `linear-gradient(to bottom, ${RED}, #7a0606)`
			}
		}),
		el(
			'div',
			{
				style: {
					flexGrow: 1,
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					gap: 28,
					paddingLeft: 72,
					paddingRight: 72
				}
			},
			el(
				'div',
				{
					style: {
						display: 'flex',
						flexDirection: 'row',
						alignItems: 'center',
						justifyContent: 'space-between'
					}
				},
				el(
					'div',
					{ style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 14 } },
					favicon
						? el('img', {
								alt: '',
								width: 52,
								height: 52,
								src: favicon as ArrayBuffer,
								style: { width: 52, height: 52, borderRadius: 13, objectFit: 'cover' }
							})
						: el(
								'div',
								{
									style: {
										width: 44,
										height: 44,
										borderRadius: 13,
										backgroundColor: RED,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										fontSize: 28,
										fontWeight: 800,
										color: '#ffffff'
									}
								},
								'A'
							),
					el(
						'span',
						{ style: { fontSize: 30, fontWeight: 800, color: INK, letterSpacing: -0.5 } },
						'Alkometriikka Daily'
					)
				),
				el(
					'div',
					{
						style: {
							display: 'flex',
							alignItems: 'center',
							backgroundColor: '#f4f1ec',
							color: SLATE,
							fontSize: 24,
							fontWeight: 700,
							borderRadius: 999,
							padding: '10px 20px'
						}
					},
					`#${display.dayNumber}`
				)
			),
			el(
				'span',
				{ style: { fontSize: 60, fontWeight: 900, letterSpacing: -1.5, color: INK } },
				formatDailyDate(display.date)
			),
			el(
				'span',
				{ style: { fontSize: 30, fontWeight: 500, color: SLATE, lineHeight: 1.35, maxWidth: 820 } },
				'Seitsemän kysymystä Alkon valikoimasta. Testaa Alko(holi)tuntemuksesi!'
			),
			el(
				'div',
				{
					style: {
						display: 'flex',
						flexDirection: 'row',
						alignItems: 'center',
						gap: 28,
						marginTop: 8
					}
				},
				emptyGrid,
				el(
					'div',
					{
						style: {
							display: 'flex',
							alignItems: 'center',
							backgroundColor: RED,
							color: '#ffffff',
							fontSize: 24,
							fontWeight: 800,
							borderRadius: 999,
							padding: '14px 28px'
						}
					},
					'Pelaa nyt →'
				)
			)
		)
	);

	return satori(tree as never, {
		width: OG_IMAGE_WIDTH,
		height: OG_IMAGE_HEIGHT,
		fonts: fonts as never
	});
}
