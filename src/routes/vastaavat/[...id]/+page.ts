import { resolve } from '$app/paths';
import { error, redirect } from '@sveltejs/kit';
import { m } from '$lib/i18n';

export async function load({ parent, params }) {
	const data = await parent();
	const alko = await data.alko;

	const id = params.id?.split('/')[0];

	if (!id) redirect(300, resolve('/'));

	// A product removed from the selection is only there once its file has loaded
	if (!alko.kaljakori.findById(id)) await alko.removedReady;
	if (!alko.kaljakori.findById(id)) {
		error(404, {
			message: m.scan_product_not_found()
		});
	}

	return data;
}
