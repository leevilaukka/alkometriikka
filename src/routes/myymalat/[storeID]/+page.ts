import { error, redirect } from '@sveltejs/kit';

export const trailingSlash = 'always';

export async function load({ parent, params }) {
	const data = await parent();
	const alko = await data.alko;
	const storeId = params.storeID;

	if (!storeId) redirect(300, '/');

	if (!alko.availability.stores[storeId]) {
		error(404, {
			message: 'Myymälää ei löytynyt'
		});
	}

	return { alko: data.alko, storeId };
}