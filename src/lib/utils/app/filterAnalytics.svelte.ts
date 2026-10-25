import { beforeNavigate } from '$app/navigation';
import { onMount } from 'svelte';
import type { AnalyticsEventMap } from '$lib/types';
import { sendAnalyticsEvent } from './analytics';

type FilterParams = Record<string, string | string[]>;
type FilterSource = AnalyticsEventMap['filters_used']['source'];
type FilterExit = AnalyticsEventMap['filters_used']['exit'];

// Umami cuts event data strings at 500 characters; long selections only need to be recognizable
const maxValueLength = 200;

function activeFilters(params: FilterParams) {
	return Object.entries(params)
		.map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value] as const)
		.filter(([, value]) => value !== '')
		.sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Sends one `filters_used` event per filtering session instead of one per change: the
 * combination the user ended up with, sent when they leave the results by opening a product,
 * navigating elsewhere or hiding the tab. A combination already sent, the one the page was
 * opened with and an empty one aren't sent again.
 *
 * `getParams` returns the filters as search parameters, where filters at their defaults are
 * empty.
 */
export function trackFilterUsage(
	source: FilterSource,
	getParams: () => FilterParams,
	getResultCount?: () => number | undefined
) {
	let lastSent: string | undefined;
	let previous: string | undefined;
	let changes = 0;

	$effect(() => {
		const signature = JSON.stringify(activeFilters(getParams()));
		// The filters the page opened with (a shared link or a return from a product) count as sent
		lastSent ??= signature;
		if (previous !== undefined && signature !== previous) changes++;
		previous = signature;
	});

	function flush(exit: FilterExit) {
		const active = activeFilters(getParams());
		const signature = JSON.stringify(active);
		const changed = changes;
		changes = 0;
		if (!changed || !active.length || signature === lastSent) return;
		lastSent = signature;
		sendAnalyticsEvent('filters_used', {
			source,
			exit,
			filters: active.map(([key]) => key),
			filter_count: active.length,
			changes: changed,
			results: getResultCount?.(),
			...Object.fromEntries(active.map(([key, value]) => [key, value.slice(0, maxValueLength)]))
		});
	}

	beforeNavigate(({ to }) => {
		const route = to?.route.id;
		flush(
			route?.startsWith('/tuotteet/') || route?.startsWith('/vastaavat/') ? 'product' : 'navigate'
		);
	});

	onMount(() => {
		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') flush('hidden');
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => document.removeEventListener('visibilitychange', onVisibilityChange);
	});
}
