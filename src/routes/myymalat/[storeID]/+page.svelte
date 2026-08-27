<script lang="ts">
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { preferredStoreId } from '$lib/global.svelte';
	import type { AvailabilityStore } from '$lib/types';
	import { AllColumns } from '$lib/utils/constants';
	import { generateTitle, sendAnalyticsEvent } from '$lib/utils/helpers';
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';

	let { data } = $props();

	function formatDate(date: string) {
		return new Intl.DateTimeFormat('fi-FI', {
			weekday: 'long',
			day: 'numeric',
			month: 'numeric'
		}).format(new Date(`${date}T00:00:00`));
	}

	function selectPreferredStore(store: AvailabilityStore) {
		$preferredStoreId = store.id;
		sendAnalyticsEvent('preferred_store_changed', {
			storeId: store.id,
			storeName: store.name,
			action: 'set'
		});
	}
</script>

<svelte:head>
	<title>{generateTitle('Myymälä')}</title>
</svelte:head>

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
	{@const store = alko.availability.stores[data.storeId] as AvailabilityStore}
	{@const address = [store.address, [store.postalCode, store.postOffice].filter(Boolean).join(' ')]
		.filter(Boolean)
		.join(', ')}
	{@const directionsQuery = ["Alko", store.name, address].filter(Boolean).join(', ')}
	{@const additionalDetails = [
		store.additional_info,
		store.location_details,
		store.unobstructured,
		store.exceptions
	].filter((detail): detail is string => Boolean(detail?.trim()))}
	<!-- DO NOT take the store.open value for the store open state as that is only updated every 4 hours, calculate it from opening hours -->
	 {@const storeOpen = store.openHours?.some((openingHour) => {
		if (!openingHour.hours || openingHour.hours === "kiinni") return false;
		const now = new Date();
		const openingDate = new Date(`${openingHour.date}T${openingHour.hours.split('-')[0]}:00`);
		const closingDate = new Date(`${openingHour.date}T${openingHour.hours.split('-')[1]}:00`);
		return now >= openingDate && now <= closingDate;
	})}

	<div class="mx-auto flex w-full max-w-[120ch] flex-col gap-6 p-6">
		<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
			<div class="flex items-center gap-2">
				<a href="/" class={twMerge(components.button({ size: 'md' }))}>
					<Icon name="home" class="inline-block" />
					<span>Etusivulle</span>
				</a>
				<a href="/myymalat">
					<button class={twMerge(components.button({ size: 'md' }))}>
						<Icon name="map_pin" />
						<span>Myymälät</span>
					</button>
				</a>
			</div>
		</div>
		
		<header class="flex flex-col gap-2 border-b border-primary pb-6">
			<div class="flex items-start justify-between gap-4">
				<div class="flex flex-col gap-2">
					<h1 class="text-2xl font-bold md:text-3xl">{store.name}</h1>
					<span class="text-secondary">Myymälän numero: {store.id}</span>
				</div>
				<span
					class={storeOpen
						? 'shrink-0 rounded bg-green-100 px-2 py-1 text-sm text-green-800 dark:bg-green-900 dark:text-green-100'
						: 'shrink-0 rounded bg-gray-100 px-2 py-1 text-sm text-gray-700 dark:bg-zinc-700 dark:text-zinc-100'}
				>
					{storeOpen ? 'Avoinna' : 'Suljettu'}
				</span>
			</div>
			{#if address}
				<p>{address}</p>
			{/if}
		</header>

		<div class="grid w-full grid-cols-1 gap-4 md:grid-cols-3">
			<button
				type="button"
				class={twMerge(
					components.button({ size: 'md', type: store.id === $preferredStoreId ? 'positive' : 'primary' }),
					'w-full px-5 py-3 text-xl'
				)}
				disabled={store.id === $preferredStoreId}
				onclick={() => selectPreferredStore(store)}
			>
				{store.id === $preferredStoreId ? 'Valittu ensisijaiseksi myymäläksi' : 'Valitse ensisijaiseksi myymäläksi'}
			</button>
			{#if directionsQuery}
				<a
					href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(directionsQuery)}`}
					target="_blank"
					rel="noopener noreferrer"
					referrerpolicy="no-referrer"
					class={twMerge(components.button({ size: 'md' }), 'w-full px-5 py-3 text-xl')}
				>
					<Icon name="map_pin" />
					<span>Näytä kartalla</span>
					<Icon name="link_external" />
				</a>
			{/if}
		
			<a
				href={`https://www.alko.fi/myymalat-palvelut/${store.id}`}
				target="_blank"
				rel="noopener noreferrer"
				referrerpolicy="no-referrer"
				class={twMerge(components.button({ size: 'md' }), 'w-full px-5 py-3 text-xl')}
			>
				<span>Alkon myymäläsivu</span>
				<Icon name="link_external" />
			</a>
		</div>
		<a
				href={`/?${AllColumns.StoreAvailability}=${encodeURIComponent(store.name)}`}
				class={twMerge(components.button({ size: 'md' }), 'w-full px-5 py-3 text-xl')}
			>
				<Icon name="list" />
				<span>Myymälän valikoima</span>
			</a>
		<section class="overflow-hidden rounded border border-primary bg-secondary">
			<h2 class="border-b border-primary px-4 py-3 text-xl font-bold">Aukioloajat</h2>
			{#if store.openHours?.length}
				<ul>
					{#each store.openHours as openingHour (openingHour.date)}
						<li class="flex items-center justify-between gap-4 border-b border-primary px-4 py-3 last:border-b-0">
							<span class="capitalize">{formatDate(openingHour.date)}</span>
							<strong>{openingHour.hours}</strong>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="px-4 py-3 text-secondary">Aukioloaikoja ei ole saatavilla.</p>
			{/if}
		</section>

		{#if additionalDetails.length}
			<section class="flex flex-col gap-2 rounded border border-primary bg-secondary p-4">
				<h2 class="text-xl font-bold">Lisätiedot</h2>
				{#each additionalDetails as detail (detail)}
					<p>{detail}</p>
				{/each}
			</section>
		{/if}
	</div>
{/await}