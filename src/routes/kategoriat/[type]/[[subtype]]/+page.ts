import { error } from '@sveltejs/kit';
import { m } from '$lib/i18n';
import { findCategoryBySlugs } from '$lib/utils/catalog/categories';

export async function load({ parent, params }) {
	const data = await parent();
	const alko = await data.alko;

	const trail = findCategoryBySlugs(alko.kaljakori.getCategoryTree(), params.type, params.subtype);
	if (!trail) {
		error(404, {
			message: m.error_category_not_found()
		});
	}

	return { trail };
}
