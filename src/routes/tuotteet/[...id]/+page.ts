import type { PageLoad } from './$types';

export const load: PageLoad = async ({parent, params}) => {
    console.log('params', params);
    const data = await parent();
	return data;
};