<script lang="ts">
	import Compare from '$lib/components/views/Compare.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { compareIdsFromParam } from '$lib/utils/compare';
	import { sendAnalyticsEvent } from '$lib/utils/helpers';
	import type { PriceListItem } from '$lib/types';

	let { data } = $props();

	let ids = $derived(compareIdsFromParam(page.url.searchParams.get('ids')));

	// The compare URL's ids are excluded from automatic pageview tracking (to keep
	// the pathname stable across arbitrary comparisons), so send an explicit event
	// with the compared items and full URL instead.
	onMount(() => {
		sendAnalyticsEvent('view_compare', { product_numbers: ids, url: page.url.href });
	});
</script>

{#await data.alko}
	<div class="grid h-full w-full place-content-center">
		<div class="flex flex-col items-center gap-3">
			<span
				class="block h-16 w-16 animate-spin rounded-full border-[0.5rem] border-red-600 border-b-transparent"
			></span>
			<p>Ladataan...</p>
		</div>
	</div>
{:then alko}
	{@const products = ids
		.map((id) => alko.kaljakori.findById(id))
		.filter((product): product is PriceListItem => Boolean(product))}
	<Compare {products} />
{/await}
