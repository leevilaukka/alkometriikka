import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import { expandSearchParams } from '$lib/utils/app/compressedParams';

export async function load({ parent, url }) {
	const data = await parent();

	if (!expandSearchParams(url.searchParams).get('ids')) redirect(300, resolve('/'));

	return data;
}
