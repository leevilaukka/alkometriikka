// The product actions as the UI runs them: the state change from compare.ts / lists.ts / punch.ts,
// plus the feedback and analytics that go with it, so every button that adds to the comparison or a
// list behaves the same whether it's on a list row, the product page or the scanner. The feedback
// is a toast at the bottom centre of the screen, in the same place wherever the button was.
import { resolve } from '$app/paths';
import { compareProductIds } from '$lib/global.svelte';
import type { ListObj } from '$lib/types';
import { sendAnalyticsEvent } from '../app/analytics';
import { appPath } from '../app/paths';
import { showToast } from '../app/toast.svelte';
import {
	addToCompareWithReference,
	compareURL,
	isInCompare,
	MAX_COMPARE_PRODUCTS,
	removeFromCompare,
	toggleCompare
} from './compare';
import { addToList, listToURI } from './lists';
import { addProductToPunch } from './punch';

export const COMPARE_FULL_TEXT = `Vertailussa voi olla enintään ${MAX_COMPARE_PRODUCTS} tuotetta`;

/**
 * Adds the product to the comparison, or takes it out if it's there. With `reference`, adding also
 * adds that product first, as what the candidate is being compared against (similar products).
 * A full comparison is reported with a link to the comparison, so a product can be removed there.
 * Returns false when nothing was added because it was full.
 */
export function toggleCompareAction(
	id: string,
	{ reference }: { reference?: string } = {}
): boolean {
	if (isInCompare(id)) {
		removeFromCompare(id);
		return true;
	}
	const added =
		reference && reference !== id ? addToCompareWithReference(reference, id) : toggleCompare(id);
	if (!added) {
		showToast({
			text: COMPARE_FULL_TEXT,
			tone: 'warning',
			href: resolve(compareURL(compareProductIds)),
			linkText: 'Avaa vertailu'
		});
	}
	return added;
}

/** Adds one of the product to the list and says so, with a link to the list */
export function addToListAction(list: ListObj, id: string) {
	addToList(list, id);
	sendAnalyticsEvent('add_to_list', { product_number: id });
	showToast({
		text: `Lisätty listaan ${list.name}`,
		href: appPath(`/listat/?list=${listToURI(list)}`),
		linkText: 'Avaa lista'
	});
}

/** Adds a package of the product to the open punch recipe and says so, with a link to the calculator */
export function addToPunchAction(id: string) {
	addProductToPunch(id);
	sendAnalyticsEvent('punch_add_product', { product_number: id });
	showToast({
		text: 'Lisätty booliin',
		href: resolve('/boolilaskuri/'),
		linkText: 'Avaa boolilaskuri'
	});
}
