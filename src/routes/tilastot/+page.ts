import type { Load } from '@sveltejs/kit';

export const load: Load = async ({ parent }) => {
	return { data: parent() };
};
