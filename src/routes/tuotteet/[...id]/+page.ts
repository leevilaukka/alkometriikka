import { error } from '@sveltejs/kit';

export async function load({ parent, params }) {
    const data = await parent();
    const alko = await data.alko

	const id = params.id?.split('/')[0];

    if (!alko.kaljakori.findById(id)) {
		error(404, {
			message: 'Tuotetta ei löytynyt'
		});
	}

	return data;
};