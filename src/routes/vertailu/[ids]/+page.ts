import { redirect } from '@sveltejs/kit';

export async function load({ parent, params }) {
	const data = await parent();

	if (!params.ids) redirect(300, '/');

	return data;
}
