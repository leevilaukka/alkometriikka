// The product sections of a store page: what arrived there lately, Alko's new
// products and sales there, and the best value per category.

import type { AvailabilityData, PriceListItem } from '$lib/types';
import { AllColumns } from '../constants/columns';
import { getSaleInfo, type SaleInfo } from './sales';
import type { StoreStockFile } from './stock';

/** Active products the store stocks, per availability.json. */
export function productsInStore(
	products: PriceListItem[],
	availability: Pick<AvailabilityData, 'product'>,
	storeId: string
): PriceListItem[] {
	return products.filter(
		(product) =>
			!product[AllColumns.RemovedFromSelection] &&
			(availability.product[product[AllColumns.Number]] ?? []).includes(storeId)
	);
}

/** The stock history's arrivals that are in `stocked`, newest first. */
export function storeArrivals(
	file: StoreStockFile,
	stocked: PriceListItem[]
): { product: PriceListItem; date: string }[] {
	const byId = new Map(stocked.map((product) => [product[AllColumns.Number], product]));
	return file.arrivals.flatMap(([id, date]) => {
		const product = byId.get(id);
		return product ? [{ product, date }] : [];
	});
}

/** Products on sale, biggest discount first. */
export function storeSales(
	products: PriceListItem[]
): { product: PriceListItem; sale: SaleInfo }[] {
	return products
		.flatMap((product) => {
			const sale = getSaleInfo({
				price: product[AllColumns.Price],
				normalPrice: product[AllColumns.NormalPrice],
				campaignStart: product[AllColumns.CampaignStart],
				campaignEnd: product[AllColumns.CampaignEnd]
			});
			return sale ? [{ product, sale }] : [];
		})
		.sort((a, b) => b.sale.discountPercent - a.sale.discountPercent);
}

/**
 * The most alcohol per euro in each type (Viinit, Oluet…), types with the most
 * products first. Types without alcohol are left out.
 */
export function bestValueByType(products: PriceListItem[]): PriceListItem[] {
	const byType = new Map<string, { best: PriceListItem; count: number }>();
	for (const product of products) {
		const value = Number(product[AllColumns.AlcoholGramsPerEuro]);
		if (!Number.isFinite(value) || value <= 0) continue;
		const type = String(product[AllColumns.Type]);
		const entry = byType.get(type);
		if (!entry) byType.set(type, { best: product, count: 1 });
		else {
			entry.count += 1;
			if (value > Number(entry.best[AllColumns.AlcoholGramsPerEuro])) entry.best = product;
		}
	}
	return [...byType.values()].sort((a, b) => b.count - a.count).map((entry) => entry.best);
}
