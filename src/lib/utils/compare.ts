import { compareProductIds } from '$lib/global.svelte';

/** Maximum number of products that can be compared at once, to keep the comparison grid usable. */
export const MAX_COMPARE_PRODUCTS = 6;

export function isInCompare(id: string): boolean {
	return compareProductIds.includes(id);
}

/** Adds `id` to the comparison selection. Returns false if the selection is already full. */
export function addToCompare(id: string): boolean {
	if (compareProductIds.includes(id)) return true;
	if (compareProductIds.length >= MAX_COMPARE_PRODUCTS) return false;
	compareProductIds.push(id);
	return true;
}

/** Adds `id` to the front of the comparison selection. Returns false if the selection is already full. */
export function addToCompareFirst(id: string): boolean {
	if (compareProductIds.includes(id)) return true;
	if (compareProductIds.length >= MAX_COMPARE_PRODUCTS) return false;
	compareProductIds.unshift(id);
	return true;
}

export function removeFromCompare(id: string): void {
	const index = compareProductIds.indexOf(id);
	if (index !== -1) compareProductIds.splice(index, 1);
}

/** Toggles `id` in the comparison selection. Returns false only when adding failed because the selection is full. */
export function toggleCompare(id: string): boolean {
	if (isInCompare(id)) {
		removeFromCompare(id);
		return true;
	}
	return addToCompare(id);
}

export function clearCompare(): void {
	compareProductIds.length = 0;
}

export function compareURL(ids: string[]): string {
	return `/vertailu/${ids.join(',')}`;
}

export function compareIdsFromParam(param: string | undefined | null): string[] {
	return [...new Set((param ?? '').split(',').map((id) => id.trim()).filter(Boolean))];
}
