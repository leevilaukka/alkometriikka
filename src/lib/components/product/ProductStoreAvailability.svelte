<script lang="ts">
	import { resolve } from '$app/paths';
	import type { AvailabilityStore } from '$lib/types';
	import {
		formatStoreDistance,
		getStoreDistance,
		getTodaysOpeningHours,
		isStoreOpen
	} from '$lib/utils/catalog/availability';
	import { formatRelativeTime } from '$lib/utils/format/format';
	import { requestSettingsOpen } from '$lib/utils/app/settings';
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import ProductStockTrend from './ProductStockTrend.svelte';

	// productNumber is also threaded through for a future `show_availability` re-evaluation
	// (see AnalyticsEventMap) - not fired here since the section is always visible now,
	// not opened by the user, so mounting isn't a meaningful "viewed" signal.
	const {
		id,
		productNumber,
		stores,
		preferredStore,
		availabilityUpdated,
		class: _class = ''
	}: {
		id?: string;
		productNumber: string;
		stores: AvailabilityStore[];
		preferredStore?: AvailabilityStore;
		availabilityUpdated: Date | undefined;
		class?: string;
	} = $props();

	const HOUR_MS = 3_600_000;
	let now = $state(new Date());

	// Keep the minute-level "päivitetty x minuuttia sitten" label ticking. Past the
	// first hour the label only changes hourly, so stop refreshing.
	$effect(() => {
		if (!availabilityUpdated) return;
		const updated = availabilityUpdated.getTime();
		if (Date.now() - updated >= HOUR_MS) return;
		const interval = setInterval(() => {
			now = new Date();
			if (now.getTime() - updated >= HOUR_MS) clearInterval(interval);
		}, 60_000);
		return () => clearInterval(interval);
	});
</script>

<section
	{id}
	class={twMerge(
		'flex scroll-mt-4 flex-col overflow-hidden rounded border border-primary bg-secondary',
		_class
	)}
>
	<header class="flex flex-col gap-0.5 border-b border-primary p-3.5">
		<h2 class="text-lg font-bold">Myymäläsaatavuus</h2>
		<p class="text-sm text-secondary">
			{stores.length}
			{stores.length === 1 ? 'myymälä' : 'myymälää'}{#if availabilityUpdated}
				· <time
					datetime={availabilityUpdated.toISOString()}
					title={availabilityUpdated.toLocaleString('fi-FI')}
					>päivitetty {formatRelativeTime(availabilityUpdated, now)}</time
				>{/if}
		</p>
		<ProductStockTrend {productNumber} class="mt-1" />
	</header>
	{#if !preferredStore}
		<div class="border-b border-primary p-3.5">
			<button
				type="button"
				class={twMerge(components.button({ type: 'positive', size: 'md' }), 'w-full')}
				onclick={requestSettingsOpen}
			>
				Valitse ensisijainen myymälä
			</button>
		</div>
	{/if}
	{#if stores.length > 0}
		<ul class="max-h-96 overflow-y-auto bg-primary">
			{#each stores as store (store.id)}
				{@const distance = formatStoreDistance(getStoreDistance(preferredStore, store))}
				{@const openingHours = getTodaysOpeningHours(store)}
				{@const storeOpen = isStoreOpen(store)}
				<li class="flex gap-2.5 border-b border-primary p-3.5 last:border-b-0">
					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<a href={resolve(`/myymalat/${store.id}/`)} class="w-fit font-bold hover:underline"
							>{store.name}</a
						>
						{#if store.address}
							<span class="text-sm text-secondary">{store.address}</span>
						{/if}
						{#if openingHours}
							<span class="text-sm text-secondary">
								{storeOpen ? `Avoinna tänään ${openingHours}` : 'Suljettu'}
							</span>
						{/if}
					</div>
					{#if distance}
						<span class="shrink-0 text-sm text-secondary">{distance}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="bg-primary p-3.5 text-secondary">Ei saatavilla myymälöissä.</p>
	{/if}
</section>
