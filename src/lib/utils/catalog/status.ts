import type { PriceListItem } from '$lib/types';
import { DatasetColumns } from '../constants/columns';

/**
 * `Tila` of a product Alko still lists as coming (Tulee) months after its online
 * launch date, with no stock anywhere, and whose details Alko no longer serves.
 * Alko seems to leave products it never launched in that state instead of
 * discontinuing them, and its product page is a 404 for them. Not one of Alko's
 * own statuses: the sync derives it (see `markStaleArrivals` in
 * scripts/data/lifecycle.ts).
 */
export const STALE_ARRIVAL_STATUS = 'Ei myynnissä';

/** True for a product Alko lists as coming long after its launch date (see `STALE_ARRIVAL_STATUS`). */
export function isStaleArrival(product: PriceListItem): boolean {
	return product[DatasetColumns.Status] === STALE_ARRIVAL_STATUS;
}
