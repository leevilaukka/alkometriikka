<script lang="ts">
	import { m } from '$lib/i18n';
	import Product from '$lib/components/views/Product.svelte';
	import { EMPTY_AVAILABILITY } from '$lib/alko/availability.svelte';
	import { page } from '$app/state';
	import { preferredStoreId, userLocation } from '$lib/global.svelte';
	import { resolvePreferredStore } from '$lib/utils/catalog/availability';
	import { AUTO_STORE_ID } from '$lib/utils/constants/app';
	import { keepAutoLocationFresh } from '$lib/utils/device/location';
	import type { AvailabilityStore, LoadState } from '$lib/types.js';

	let { data } = $props();

	$effect(() => {
		if ($preferredStoreId === AUTO_STORE_ID) return keepAutoLocationFresh();
	});

	// The price list once loaded; until then, or if it fails, the stub's own row (`data.preview`)
	// stands in for it. The layout says when it failed
	let alko = $state.raw<Awaited<typeof data.alko>>();
	let alkoFailed = $state(false);
	$effect(() => {
		data.alko.then(
			(value) => (alko = value),
			() => (alkoFailed = true)
		);
	});
	const catalogState = $derived<LoadState>(alko ? 'loaded' : alkoFailed ? 'failed' : 'loading');
	// Store data comes with the price list, so it fails along with it
	const availabilityState = $derived<LoadState>(
		alkoFailed || alko?.availabilityFailed
			? 'failed'
			: alko?.availabilityLoaded
				? 'loaded'
				: 'loading'
	);

	let id = $derived(page.params.id?.split('/')[0] as string); // Handle both /tuotteet/123 and /tuotteet/123/extra paths

	const kaljakori = $derived(alko?.kaljakori ?? data.preview);
	const product = $derived(kaljakori?.findById(id) ?? data.preview?.findById(id));

	// Store availability loads after the price list, and the page fills it in when it arrives
	const availabilityStores = $derived(
		(alko?.availability.product[id] ?? [])
			.map((storeId: string) => alko!.availability.stores[storeId])
			.filter((store: AvailabilityStore | undefined): store is AvailabilityStore => Boolean(store))
	);
	const preferredStore = $derived(
		alko && resolvePreferredStore(alko.availability.stores, $preferredStoreId, $userLocation)
	);
	const availabilityUpdated = $derived(
		alko?.availability.lastUpdated ? new Date(alko.availability.lastUpdated) : undefined
	);
</script>

{#if product && kaljakori}
	<Product
		{product}
		{kaljakori}
		{catalogState}
		availability={alko?.availability ?? EMPTY_AVAILABILITY}
		{availabilityState}
		{availabilityStores}
		{preferredStore}
		{availabilityUpdated}
	/>
{:else}
	<div class="grid h-full w-full place-content-center">
		<div class="flex flex-col items-center gap-3">
			<span
				class="block h-16 w-16 animate-spin rounded-full border-[0.5rem] border-red-600 border-b-transparent"
			></span>
			<p>{m.common_loading()}</p>
		</div>
	</div>
{/if}
