import { error, redirect, type Load } from '@sveltejs/kit';

export const load: Load = async ({ parent, params }) => {
    const data = await parent();
    const alko = await data.alko

	const id = params.id?.split('/')[0];

	if (!id) redirect(300, "/");

    if (!alko.kaljakori.findById(id)) {
		error(404, {
			message: 'Tuotetta ei löytynyt'
		});
	}

	return data;
};