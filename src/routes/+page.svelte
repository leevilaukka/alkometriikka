<script lang="ts">
	import Main from '$lib/components/views/Main.svelte';
	import WatchlistBanner from '$lib/components/widgets/WatchlistBanner.svelte';
	import { generateTitle, resetSEO } from '$lib/utils/app/meta';
	import type { PageProps } from './$types';
	import { page } from '$app/state';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { watchlist } from '$lib/global.svelte';

	let { data }: PageProps = $props();
	resetSEO();

	// A store filter from the URL needs store availability, or the list would start out empty
	const needsStores = page.url.searchParams.has(AllColumns.StoreAvailability);
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
	<Main kaljakori={alko.kaljakori} header={watchlist.length ? header : undefined} />
{/await}
