<script lang="ts">
	import { m } from '$lib/i18n';
	import Compare from '$lib/components/views/Compare.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { compareIdsFromParam } from '$lib/utils/user/compare';
	import { readSearchParams } from '$lib/utils/app/compressedParams';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import type { PriceListItem } from '$lib/types';

	let { data } = $props();

	let ids = $derived(compareIdsFromParam(readSearchParams(page.url).get('ids')));

	// Long id lists are compressed into the URL's fragment, which `load` can't read, so a
	// comparison of nothing is sent to the front page from here
	$effect(() => {
		if (!ids.length) goto(resolve('/'), { replaceState: true });
	});

	// The compare URL's ids are excluded from automatic pageview tracking (to keep
	// the pathname stable across arbitrary comparisons), so send an explicit event
	// with the compared items and full URL instead.
	onMount(() => {
		if (ids.length)
			sendAnalyticsEvent('view_compare', { product_numbers: ids, url: page.url.href });
	});
</script>

{#if ids.length}
	{#await data.alkoWithRemoved}
		<div class="grid h-full w-full place-content-center">
			<div class="flex flex-col items-center gap-3">
				<span
					class="block h-16 w-16 animate-spin rounded-full border-[0.5rem] border-red-600 border-b-transparent"
				></span>
				<p>{m.common_loading()}</p>
			</div>
		</div>
	{:then alko}
		{@const products = ids
			.map((id) => alko.kaljakori.findById(id))
			.filter((product): product is PriceListItem => Boolean(product))}
		<Compare {products} />
	{/await}
{/if}
