import { error, redirect } from '@sveltejs/kit';

export const trailingSlash = 'always';

export async function load({ parent, params }) {
	const data = await parent();
	const alko = await data.alko;
	const storeId = params.storeID;

	if (!storeId) redirect(300, '/');

	if (!alko.availability.stores[storeId]) {
		throw error(404, {
			message: 'Myymälää ei löytynyt'
		});
	}
	
	return { store: (await data.alko).availability.stores[storeId], storeId };
}