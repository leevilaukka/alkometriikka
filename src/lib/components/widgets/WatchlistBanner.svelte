<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Kaljakori } from '$lib/alko';
	import { preferredStoreId, userLocation, watchlist } from '$lib/global.svelte';
	import type { AvailabilityData } from '$lib/types';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { resolvePreferredStore } from '$lib/utils/catalog/availability';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { components } from '$lib/utils/ui/styles';
	import { summarizeWatchChanges, watchStatuses } from '$lib/utils/user/watchlist';
	import { twMerge } from 'tailwind-merge';
	import Icon from './Icon.svelte';

	/** Tells a returning user that products they watch have changed since they last looked. */
	const {
		kaljakori,
		availability,
		availabilityLoaded
	}: { kaljakori: Kaljakori; availability: AvailabilityData; availabilityLoaded: boolean } =
		$props();

	const changes = $derived.by(() => {
		if (watchlist.length === 0) return [];
		const byId = new Map(kaljakori.data.map((item) => [item[AllColumns.Number], item]));
		// Until store data is in, only price and selection changes can be told apart
		const stores = availabilityLoaded ? availability : null;
		const store = resolvePreferredStore(availability.stores, $preferredStoreId, $userLocation);
		return watchStatuses(watchlist, (id) => byId.get(id), stores, store?.id).flatMap(
			(status) => status.changes
		);
	});
</script>

{#if changes.length}
	<a
		href={resolve('/seuratut/')}
		onclick={() => sendAnalyticsEvent('open_watchlist_banner', { changed: changes.length })}
		class={twMerge(
			components.button({ size: 'md' }),
			'w-full justify-start gap-3 border-green-600 px-3 py-2 text-start'
		)}
	>
		<Icon name="bell_ring" class="shrink-0 text-xl text-green-700 dark:text-green-400" />
		<span class="flex min-w-0 flex-1 flex-col">
			<strong>Seuraamasi tuotteet ovat muuttuneet</strong>
			<span class="truncate text-sm text-secondary">{summarizeWatchChanges(changes)}</span>
		</span>
		<Icon name="chevron_right" class="shrink-0" />
	</a>
{/if}
