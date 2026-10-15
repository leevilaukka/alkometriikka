import { resolve } from '$app/paths';
import { error, redirect } from '@sveltejs/kit';
import { m } from '$lib/i18n';

export async function load({ parent, params }) {
	const data = await parent();
	const alko = await data.alkoWithStores;
	const storeId = params.storeID;

	if (!storeId) redirect(300, resolve('/'));

	if (!alko.availability.stores[storeId]) {
		throw error(404, {
			message: m.store_not_found_title()
		});
	}

	return { store: alko.availability.stores[storeId], storeId };
}
