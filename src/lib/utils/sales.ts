/**
 * Sales/campaign helpers.
 *
 * Alko reports a reference "normal" price (`lowest_30d_price`) together with an
 * optional campaign window for some products. A product counts as being on sale
 * when its current price is below that reference price.
 */

export type SaleInfo = {
	salePrice: number;
	normalPrice: number;
	/** Rounded whole-percent discount (e.g. 10 for "10%"). */
	discountPercent: number;
	campaignStart?: string;
	campaignEnd?: string;
};

function toNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const normalized = Number(value.replace(',', '.').trim());
		if (Number.isFinite(normalized)) return normalized;
	}
	return null;
}

function toDateString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

/** Today's local date as `YYYY-MM-DD`, matching the format Alko reports campaign dates in. */
function toISODate(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A campaign is active when the given day falls inside its window. With no
 * dates we cannot time-gate, so the campaign is treated as active (the price
 * comparison in {@link getSaleInfo} remains the deciding factor).
 */
function isCampaignActive(start?: string, end?: string, today?: string): boolean {
	if (!start && !end) return true;
	const day = today ?? toISODate(new Date());
	if (start && day < start) return false;
	if (end && day > end) return false;
	return true;
}

/** Date-safe ISO (YYYY-MM-DD) → Finnish locale formatter that avoids timezone shifts. */
function formatISODate(date?: string): string | null {
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
	const [year, month, day] = date.split('-').map(Number);
	if (!year || !month || !day) return null;
	return new Date(year, month - 1, day).toLocaleDateString('fi-FI');
}

/**
 * Detects whether a product is on sale and returns the sale info.
 *
 * A product counts as being on sale when its current price is below the
 * reference price *and* the campaign is currently active. The campaign window
 * is only consulted when campaign dates are present; a campaign that has ended
 * (or not yet started) is not shown as a sale, even if the dataset still holds
 * a discounted price from a previous sync.
 *
 * Pass `today` (YYYY-MM-DD) to override the reference day, e.g. in tests.
 * Returns `null` when the product is not on sale.
 */
export function getSaleInfo(item: {
	price?: unknown;
	normalPrice?: unknown;
	campaignStart?: unknown;
	campaignEnd?: unknown;
}, today?: string): SaleInfo | null {
	const salePrice = toNumber(item.price);
	const normalPrice = toNumber(item.normalPrice);
	if (salePrice === null || normalPrice === null || salePrice <= 0 || normalPrice <= salePrice) {
		return null;
	}
	const campaignStart = toDateString(item.campaignStart);
	const campaignEnd = toDateString(item.campaignEnd);
	if (!isCampaignActive(campaignStart, campaignEnd, today)) {
		return null;
	}
	return {
		salePrice,
		normalPrice,
		discountPercent: Math.round((1 - salePrice / normalPrice) * 100),
		campaignStart,
		campaignEnd
	};
}

/** Formats the campaign window like "2.9.2026 – 29.9.2026". */
export function formatCampaignWindow(info: SaleInfo): string | null {
	const start = formatISODate(info.campaignStart);
	const end = formatISODate(info.campaignEnd);
	if (start && end) return `${start} – ${end}`;
	return start ?? end ?? null;
}
