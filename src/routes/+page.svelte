<script lang="ts">
	import Main from '$lib/components/views/Main.svelte';
	import { generateTitle, resetSEO } from '$lib/utils/app/meta';
	import type { PageProps } from './$types';
	import { page } from '$app/state';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { expandSearchParams } from '$lib/utils/app/compressedParams';

	let { data }: PageProps = $props();
	resetSEO();

	// A store filter from the URL needs store availability, or the list would start out empty
	const needsStores = expandSearchParams(page.url.searchParams).has(AllColumns.StoreAvailability);
</script>

<svelte:head>
	<title>{generateTitle()}</title>
</svelte:head>

{#await needsStores ? data.alkoWithStores : data.alko then alko}
	<Main kaljakori={alko.kaljakori} />
{/await}
