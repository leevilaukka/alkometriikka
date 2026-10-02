import { error } from '@sveltejs/kit';
import { findCategoryBySlugs } from '$lib/utils/categories';

export const trailingSlash = 'always';

export async function load({ parent, params }) {
	const data = await parent();
	const alko = await data.alko;

	const trail = findCategoryBySlugs(alko.kaljakori.getCategoryTree(), params.type, params.subtype);
	if (!trail) {
		error(404, {
			message: 'Kategoriaa ei löytynyt'
		});
	}

	return { trail };
}
