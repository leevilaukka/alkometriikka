<script lang="ts">
	import Main, { type ListPosition } from '$lib/components/views/Main.svelte';
	import WatchlistBanner from '$lib/components/widgets/WatchlistBanner.svelte';
	import { beforeNavigate } from '$app/navigation';
	import { generateTitle, resetSEO } from '$lib/utils/app/meta';
	import type { PageProps, Snapshot } from './$types';
	import { page } from '$app/state';
	import { AllColumns } from '$lib/utils/constants/columns';
	import {
		browsePrefs,
		onlyPreferredStore,
		preferredStoreId,
		userLocation,
		watchlist
	} from '$lib/global.svelte';
	import { get } from 'svelte/store';
	import { resolvePreferredStore } from '$lib/utils/catalog/availability';
	import { productVisibility } from '$lib/utils/user/browsePrefs';
	import { requestSettingsTab } from '$lib/utils/app/settings';
	import { keepAutoLocationFresh } from '$lib/utils/device/location';
	import { AUTO_STORE_ID } from '$lib/utils/constants/app';
	import { onMount } from 'svelte';
	import { readSearchParams } from '$lib/utils/app/compressedParams';

	let { data }: PageProps = $props();
	resetSEO();

	// A store filter from the URL needs store availability, or the list would start out empty,
	// and showing removed products needs them loaded, or the ranges would leave some out
	const params = readSearchParams(page.url);
	// The user's own settings are read once, so changing them doesn't reshuffle a list in view; the
	// settings dialog reloads the page when they're saved
	const prefs = $state.snapshot(browsePrefs);
	const limitToStore = get(onlyPreferredStore) && !!get(preferredStoreId);
	const needsStores = params.has(AllColumns.StoreAvailability) || limitToStore;
	const needsRemoved = params.get('removed') === 'true';
	const ready = $derived(
		Promise.all([
			needsStores ? data.alkoWithStores : data.alko,
			needsRemoved ? data.alkoWithRemoved : data.alko
		]).then(([alko]) => alko)
	);

	onMount(() => {
		if (limitToStore && get(preferredStoreId) === AUTO_STORE_ID) return keepAutoLocationFresh();
	});

	// Going back to the list returns to where it was scrolled. Cleared on every navigation so
	// only back/forward, which restores the snapshot, scrolls it.
	let main: Main | undefined = $state();
	let position: ListPosition | undefined = $state();
	beforeNavigate(() => (position = undefined));
	export const snapshot: Snapshot<ListPosition | undefined> = {
		capture: () => main?.currentPosition(),
		restore: (value) => (position = value)
	};
</script>

<svelte:head>
	<title>{generateTitle()}</title>
</svelte:head>

{#await ready then alko}
	<!-- Main's own heading is replaced by a header, so this one brings it back -->
	{#snippet header()}
		<h1 class="sr-only">Alkon tuotteet</h1>
		<WatchlistBanner
			kaljakori={alko.kaljakori}
			availability={alko.availability}
			availabilityLoaded={alko.availabilityLoaded}
		/>
	{/snippet}
	{@const store = limitToStore
		? resolvePreferredStore(alko.availability.stores, get(preferredStoreId), get(userLocation))
		: undefined}
	{@const visible = productVisibility(
		prefs,
		store ? { id: store.id, availability: alko.availability } : undefined
	)}
	{#snippet notice()}
		<span class="text-sm text-secondary">
			· rajattu asetuksillasi{store ? ` (${store.name})` : ''}.
			<button class="underline" onclick={() => requestSettingsTab('browsing')}>Muokkaa</button>
		</span>
	{/snippet}
	<Main
		kaljakori={alko.kaljakori}
		{visible}
		notice={visible ? notice : undefined}
		header={watchlist.length ? header : undefined}
		{position}
		bind:this={main}
	/>
{/await}
