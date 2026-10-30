<script lang="ts">
	import { resolve } from '$app/paths';
	import { locationDenied, preferredStoreId } from '$lib/global.svelte';
	import type { AvailabilityStore, LoadState } from '$lib/types';
	import {
		filterStoresByQuery,
		formatStoreDistance,
		getStoreCity,
		getStoreDistance,
		getTodaysOpeningHours,
		isStoreOpen,
		rankStoresByDistance
	} from '$lib/utils/catalog/availability';
	import { formatRelativeTime } from '$lib/utils/format/format';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { AUTO_STORE_ID } from '$lib/utils/constants/app';
	import { requestUserLocation } from '$lib/utils/device/location';
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import Icon from '../widgets/Icon.svelte';
	import ProductStockTrend from './ProductStockTrend.svelte';

	// productNumber is also threaded through for a future `show_availability` re-evaluation
	// (see AnalyticsEventMap) - not fired here since the section is always visible now,
	// not opened by the user, so mounting isn't a meaningful "viewed" signal.
	const {
		id,
		productNumber,
		stores,
		allStores,
		availabilityState,
		preferredStore,
		availabilityUpdated,
		class: _class = ''
	}: {
		id?: string;
		productNumber: string;
		stores: AvailabilityStore[];
		/** Every store, so a search can also say which ones don't have the product */
		allStores: AvailabilityStore[];
		/** `stores` is empty, rather than the product in no store, unless availability has loaded */
		availabilityState: LoadState;
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

	let query = $state('');
	let searchTrackedFor: string | undefined;

	const searching = $derived(query.trim() !== '');
	const inNoStore = $derived(availabilityState === 'loaded' && stores.length === 0);
	const stockedStoreIds = $derived(new Set(stores.map((store) => store.id)));
	const shownStores = $derived(
		searching ? rankStoresByDistance(filterStoresByQuery(allStores, query), preferredStore) : stores
	);

	function trackSearch() {
		if (searchTrackedFor === productNumber) return;
		searchTrackedFor = productNumber;
		sendAnalyticsEvent('store_availability_search', { product_number: productNumber });
	}

	// Takes effect right away, so a search can go on from here without a reload
	function selectPreferredStore(store: AvailabilityStore) {
		$preferredStoreId = store.id;
		sendAnalyticsEvent('preferred_store_changed', {
			storeId: store.id,
			storeName: store.name,
			city: getStoreCity(store)
		});
	}

	function selectNearestStore() {
		$preferredStoreId = AUTO_STORE_ID;
		requestUserLocation();
		sendAnalyticsEvent('preferred_store_changed', {
			storeId: AUTO_STORE_ID,
			storeName: 'Auto'
		});
	}
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
			{#if availabilityState === 'loading'}
				Haetaan saatavuutta…
			{:else if availabilityState === 'failed'}
				Saatavuustietoja ei saatu ladattua
			{:else}
				{stores.length}
				{stores.length === 1 ? 'myymälä' : 'myymälää'}
			{/if}{#if availabilityUpdated}
				· <time
					datetime={availabilityUpdated.toISOString()}
					title={availabilityUpdated.toLocaleString('fi-FI')}
					>päivitetty {formatRelativeTime(availabilityUpdated, now)}</time
				>{/if}
		</p>
		<ProductStockTrend {productNumber} class="mt-1" />
	</header>
	{#if availabilityState !== 'failed' && !inNoStore}
		<div class="flex flex-col gap-2 border-b border-primary p-3.5">
			<label class="sr-only" for="myymalasaatavuus-haku">Hae myymälää</label>
			<input
				id="myymalasaatavuus-haku"
				type="search"
				bind:value={query}
				oninput={trackSearch}
				placeholder="Hae myymälää tai paikkakuntaa"
				class={twMerge(components.input({ size: 'md' }), 'w-full')}
			/>
			{#if availabilityState === 'loaded' && !preferredStore && !$locationDenied}
				<button
					type="button"
					class={twMerge(components.button({ size: 'sm' }), 'w-full')}
					onclick={selectNearestStore}
				>
					Valitse lähin myymälä automaattisesti
				</button>
			{/if}
		</div>
	{/if}
	{#if availabilityState === 'failed'}
		<div class="flex flex-col items-start gap-2.5 bg-primary p-3.5 text-secondary">
			<p>Myymälöiden saatavuutta ei saatu ladattua.</p>
			<button
				type="button"
				class={components.button({ size: 'sm' })}
				onclick={() => location.reload()}
			>
				Yritä uudelleen
			</button>
		</div>
	{:else if availabilityState === 'loading'}
		<!-- As tall as the list usually is, which scrolls past max-h-96 -->
		<div aria-hidden="true" class="flex h-96 flex-col gap-2 overflow-hidden bg-primary p-3.5">
			{#each { length: 6 }, index (index)}
				<div class="h-12 animate-pulse rounded bg-secondary"></div>
			{/each}
		</div>
	{:else if inNoStore}
		<p class="bg-primary p-3.5 text-secondary">Ei saatavilla myymälöissä.</p>
	{:else if shownStores.length > 0}
		<ul class="max-h-96 overflow-y-auto bg-primary">
			{#each shownStores as store (store.id)}
				{@const distance = formatStoreDistance(getStoreDistance(preferredStore, store))}
				{@const openingHours = getTodaysOpeningHours(store)}
				{@const storeOpen = isStoreOpen(store)}
				{@const stocked = stockedStoreIds.has(store.id)}
				{@const isPreferred = store.id === preferredStore?.id}
				<li class="flex gap-2.5 border-b border-primary p-3.5 last:border-b-0">
					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<a href={resolve(`/myymalat/${store.id}/`)} class="w-fit font-bold hover:underline"
							>{store.name}</a
						>
						{#if searching}
							<span
								class={twMerge(
									'flex items-center gap-1 text-sm',
									stocked ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
								)}
							>
								<Icon name={stocked ? 'check_circle' : 'x_circle'} />
								{stocked ? 'Saatavilla' : 'Ei saatavilla'}
							</span>
						{/if}
						{#if store.address}
							<span class="text-sm text-secondary">{store.address}</span>
						{/if}
						{#if openingHours}
							<span class="text-sm text-secondary">
								{storeOpen ? `Avoinna tänään ${openingHours}` : 'Suljettu'}
							</span>
						{/if}
					</div>
					<div class="flex shrink-0 flex-col items-end gap-1.5">
						{#if distance}
							<span class="text-sm text-secondary">{distance}</span>
						{/if}
						<button
							type="button"
							class={components.button({ size: 'sm', type: isPreferred ? 'positive' : 'primary' })}
							disabled={isPreferred}
							aria-label={isPreferred
								? `${store.name} on ensisijainen myymäläsi`
								: `Valitse ${store.name} ensisijaiseksi myymäläksi`}
							onclick={() => selectPreferredStore(store)}
						>
							{isPreferred ? 'Valittu' : 'Valitse'}
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="bg-primary p-3.5 text-secondary">Hakua vastaavia myymälöitä ei löytynyt.</p>
	{/if}
</section>
