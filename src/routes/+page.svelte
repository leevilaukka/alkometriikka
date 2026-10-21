<script lang="ts">
	import Main, { type ListPosition } from '$lib/components/views/Main.svelte';
	import WatchlistBanner from '$lib/components/widgets/WatchlistBanner.svelte';
	import { beforeNavigate } from '$app/navigation';
	import { generateTitle, resetSEO } from '$lib/utils/app/meta';
	import type { PageProps, Snapshot } from './$types';
	import { page } from '$app/state';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { watchlist } from '$lib/global.svelte';

	let { data }: PageProps = $props();
	resetSEO();

	// A store filter from the URL needs store availability, or the list would start out empty
	const needsStores = page.url.searchParams.has(AllColumns.StoreAvailability);

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

{#await needsStores ? data.alkoWithStores : data.alko then alko}
	<!-- Main's own heading is replaced by a header, so this one brings it back -->
	{#snippet header()}
		<h1 class="sr-only">Alkon tuotteet</h1>
		<WatchlistBanner
			kaljakori={alko.kaljakori}
			availability={alko.availability}
			availabilityLoaded={alko.availabilityLoaded}
		/>
	{/snippet}
	<Main
		kaljakori={alko.kaljakori}
		header={watchlist.length ? header : undefined}
		{position}
		bind:this={main}
	/>
{/await}
