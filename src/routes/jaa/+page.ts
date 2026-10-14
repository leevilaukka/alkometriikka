import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import { searchQuery } from '$lib/global.svelte';
import { shareDestination } from '$lib/utils/app/shareTarget';
import type { PageLoad } from './$types';

/** The manifest's share_target: opens what was shared to the installed app */
export const load: PageLoad = ({ url }) => {
	const destination = shareDestination({
		title: url.searchParams.get('title'),
		text: url.searchParams.get('text'),
		url: url.searchParams.get('url')
	});
	if ('productId' in destination) redirect(307, resolve(`/tuotteet/${destination.productId}/`));

	const { query } = destination;
	// The search box reads q only when the app first loads, which was on this page
	searchQuery.set(query);
	redirect(307, query ? `${resolve('/')}?q=${encodeURIComponent(query)}` : resolve('/'));
};
