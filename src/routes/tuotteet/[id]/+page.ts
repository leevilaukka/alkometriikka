import type { PageLoad } from './$types';

export const load: PageLoad = async ({parent}) => {
    const data = await parent();
	return data;
};