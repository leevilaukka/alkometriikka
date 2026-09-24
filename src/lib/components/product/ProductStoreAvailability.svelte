<script lang="ts">
	import type { AvailabilityStore } from '$lib/types';
	import {
		formatStoreDistance,
		getStoreDistance,
		getTodaysOpeningHours,
		isStoreOpen
	} from '$lib/utils/availability';
	import { requestSettingsOpen } from '$lib/utils/settings';
	import { components } from '$lib/utils/styles';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';

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

	const COLLAPSED_COUNT = 5;
	let expanded = $state(false);
	const visibleStores = $derived(expanded ? stores : stores.slice(0, COLLAPSED_COUNT));
</script>

<section {id} class={twMerge('flex flex-col overflow-hidden rounded border border-primary bg-secondary scroll-mt-4', _class)}>
	<header class="flex flex-col gap-0.5 border-b border-primary p-3.5">
		<h2 class="text-lg font-bold">Myymäläsaatavuus</h2>
		<p class="text-sm text-secondary">
			{stores.length} myymälää{availabilityUpdated
				? ` · päivitetty ${availabilityUpdated.toLocaleString('fi-FI')}`
				: ''}
		</p>
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
	{#if visibleStores.length > 0}
		<ul class="bg-primary">
			{#each visibleStores as store (store.id)}
				{@const distance = formatStoreDistance(getStoreDistance(preferredStore, store))}
				{@const openingHours = getTodaysOpeningHours(store)}
				{@const storeOpen = isStoreOpen(store)}
				<li class="flex gap-2.5 border-b border-primary p-3.5 last:border-b-0">
					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<a href={`/myymalat/${store.id}/`} class="w-fit font-bold hover:underline">{store.name}</a>
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
	{#if stores.length > COLLAPSED_COUNT}
		<div class="p-3.5">
			<button
				type="button"
				class={twMerge(components.button({ size: 'sm' }), 'flex w-full items-center justify-center gap-2')}
				onclick={() => (expanded = !expanded)}
			>
				<span>{expanded ? 'Näytä vähemmän' : `Näytä kaikki ${stores.length} myymälää`}</span>
				<Icon name={`chevron_${expanded ? 'up' : 'down'}`} />
			</button>
		</div>
	{/if}
</section>
