import { validateList } from '$lib/utils/lists.js';
import { decompressFromEncodedURIComponent } from 'lz-string';

export async function load({ parent, url }) {
    const data = await parent();
    const listParam = url.searchParams.get('list');
    const isValid = listParam && validateList(listParam);
    console.log('isValid', isValid);
    const list = isValid ? JSON.parse(decompressFromEncodedURIComponent(listParam)) : null;

    return { ...data, list };
}