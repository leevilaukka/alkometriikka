<script lang="ts">
	import Product from '$lib/components/views/Product.svelte';
	import { page } from '$app/state';
	import { preferredStoreId, userLocation } from '$lib/global.svelte';
	import { resolvePreferredStore } from '$lib/utils/availability';
	import { AUTO_STORE_ID } from '$lib/utils/constants';
	import { keepAutoLocationFresh } from '$lib/utils/location';
	import type { AvailabilityStore, PriceListItem } from '$lib/types.js';

	let { data } = $props(); 

	$effect(() => {
		if ($preferredStoreId === AUTO_STORE_ID) return keepAutoLocationFresh();
	});

	let id = $derived(page.params.id?.split('/')[0]); // Handle both /tuotteet/123 and /tuotteet/123/extra paths
</script>

{#await data.alkoWithStores}
	<div class="grid h-full w-full place-content-center">
		<div class="flex flex-col items-center gap-3">
			<span
				class="block h-16 w-16 animate-spin rounded-full border-[0.5rem] border-red-600 border-b-transparent"
			></span>
			<p>Ladataan...</p>
		</div>
	</div>
{:then alko}
	{@const product = alko.kaljakori.findById(id as string) as PriceListItem}
	{@const availabilityStores = (alko.availability.product[id as string] ?? [])
		.map((storeId: string) => alko.availability.stores[storeId])
		.filter((store: AvailabilityStore | undefined): store is AvailabilityStore => Boolean(store))}
	{@const preferredStore = resolvePreferredStore(alko.availability.stores, $preferredStoreId, $userLocation)}
	{@const availabilityUpdated = alko.availability?.lastUpdated ? new Date(alko.availability.lastUpdated) : undefined}
	<Product product={product} kaljakori={alko.kaljakori} {availabilityStores} {preferredStore} availabilityUpdated={availabilityUpdated} />
{/await}