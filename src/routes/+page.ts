import type { PageLoad } from './$types';

export const load: PageLoad = async ({parent}) => {
    const { dataset } = await parent();
	return { dataset };
};