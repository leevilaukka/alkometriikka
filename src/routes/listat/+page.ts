import { validateList } from '$lib/utils/lists.js';
import { error } from '@sveltejs/kit';
import { decompressFromEncodedURIComponent } from 'lz-string';

export async function load({ parent, url }) {
    const data = await parent();
    const listParam = url.searchParams.get('list');
    const isValid = listParam && validateList(listParam);
    const list = isValid ? JSON.parse(decompressFromEncodedURIComponent(listParam)) : null;

    if (listParam && !isValid) {
		error(400, {
			message: 'Listan tietoja ei voida lukea. Tarkista linkki.'
		});
	}

    return { ...data, list };
}