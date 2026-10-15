import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';

export async function load({ parent, url }) {
	const data = await parent();

	if (!url.searchParams.get('ids')) redirect(300, resolve('/'));

	return data;
}
