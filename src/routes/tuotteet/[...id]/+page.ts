import { error } from '@sveltejs/kit';

export async function load({ parent, params }) {
    console.log('params', params);
    const data = await parent();
    const alko = await data.alko

    if (!alko.kaljakori.findById(params.id)) {
		error(404, {
			message: 'Tuotetta ei löytynyt'
		});
	}

	return data;
};