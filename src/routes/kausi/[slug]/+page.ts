import { error } from '@sveltejs/kit';
import { findSeason } from '$lib/utils/catalog/seasons';

export async function load({ params }) {
	const season = findSeason(params.slug);
	if (!season) {
		error(404, {
			message: 'Sivua ei löytynyt'
		});
	}
	return { season };
}
