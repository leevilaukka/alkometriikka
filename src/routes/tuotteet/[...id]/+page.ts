import { resolve } from '$app/paths';
import { error, redirect } from '@sveltejs/kit';
import { m } from '$lib/i18n';
import { Kaljakori } from '$lib/alko';
import { personalInfo } from '$lib/global.svelte';
import { STUB_DATA_ID } from '$lib/utils/app/seo';
import { parseDataset } from '$lib/utils/catalog/dataset';

/**
 * The product's own row from its prerendered stub (scripts/site/prerender-products.ts), as a
 * one-product Kaljakori. Only the page the stub was served for has one.
 */
function readPreview(id: string) {
	const text = document.getElementById(STUB_DATA_ID)?.textContent;
	if (!text) return undefined;
	try {
		const kaljakori = new Kaljakori(parseDataset(text).table, personalInfo);
		return kaljakori.findById(id) ? kaljakori : undefined;
	} catch (e) {
		console.warn(e);
		return undefined;
	}
}

export async function load({ parent, params }) {
	const data = await parent();

	const id = params.id?.split('/')[0];

	if (!id) redirect(300, resolve('/'));

	// With a preview the page renders right away (and so does the layout, see `preview` there)
	// and fills in the rest once the price list has loaded
	const preview = readPreview(id);
	if (preview) return { ...data, preview };

	const alko = await data.alko;
	// A product removed from the selection is only there once its file has loaded
	if (!alko.kaljakori.findById(id)) await alko.removedReady;
	if (!alko.kaljakori.findById(id)) {
		error(404, {
			message: m.scan_product_not_found()
		});
	}

	return { ...data, preview };
}
