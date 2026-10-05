<script lang="ts">
	import Icon from '$lib/components/widgets/Icon.svelte';
	import StoreCompass from '$lib/components/widgets/StoreCompass.svelte';
	import { preferredStoreId } from '$lib/global.svelte';
	import type { AvailabilityStore } from '$lib/types';
	import { getStoreCity, isStoreOpen } from '$lib/utils/availability.js';
	import { AllColumns } from '$lib/utils/constants';
	import { generateTitle, sendAnalyticsEvent, setSEO } from '$lib/utils/helpers';
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
			city: getStoreCity(store),
		});
	}


	$effect(() => data.store && setSEO({
		og: {
			title: generateTitle(`Myymälä - ${data.store.name}`),
			description: `Alkon myymälä - ${data.store.name}. Katso aukioloajat, osoite ja valikoima Alkometriikasta!`,
			url: window.location.href,
			type: 'website',
		},
		keywords: `Alko, myymälä, ${data.store.name}, ${data.store.address}, ${data.store.postalCode}, ${data.store.postOffice}`,
		description: `Alkon myymälä - ${data.store.name}.`,
	}));
</script>

<svelte:head>
	<title>{generateTitle(`Myymälä - ${data.store.name}`)}</title>
</svelte:head>

{#snippet nav()}
	<nav class="flex items-center gap-2">
		<a href="/" class={twMerge(components.button({ size: 'md' }))}>
			<Icon name="home" class="inline-block" />
			<span>Etusivulle</span>
		</a>
		<a href="/myymalat" class={twMerge(components.button({ size: 'md' }))}>
			<Icon name="map_pin" />
			<span>Myymälät</span>
		</a>
	</nav>
{/snippet}

{#if data.store}
	{@const store = data.store}
	{@const address = [store.address, [store.postalCode, store.postOffice].filter(Boolean).join(' ')]
		.filter(Boolean)
		.join(', ')}
	{@const directionsQuery = ['Alko', store.name, address].filter(Boolean).join(', ')}
	{@const additionalDetails = [
		store.additional_info,
		store.location_details,
		store.unobstructured,
		store.exceptions
	].filter((detail): detail is string => Boolean(detail?.trim()))}
	{@const storeOpen = isStoreOpen(store)}
	{@const today = new Date().toLocaleDateString('sv-SE')}
	{@const isPreferred = store.id === $preferredStoreId}

	<div class="mx-auto flex w-full max-w-[120ch] flex-col gap-6 p-4 md:p-6">
		{@render nav()}

		<header class="flex flex-col gap-4 rounded border border-primary bg-secondary p-5 md:p-6">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="flex flex-col gap-1">
					<h1 class="text-2xl font-bold md:text-4xl">{store.name}</h1>
					{#if address}
						<p class="text-lg">{address}</p>
					{/if}
					<span class="text-sm text-secondary">Myymälän numero: {store.id}</span>
				</div>
				<span
					class={twMerge(
						'shrink-0 rounded px-3 py-1 text-sm font-semibold',
						storeOpen
							? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
							: 'bg-gray-100 text-gray-700 dark:bg-zinc-700 dark:text-zinc-100'
					)}
				>
					{storeOpen ? 'Avoinna' : 'Suljettu'}
				</span>
			</div>

			<div class="grid grid-cols-2 gap-2 border-t border-primary pt-4 sm:flex sm:flex-wrap sm:gap-3">
				<a
					href={`/?${AllColumns.StoreAvailability}=${encodeURIComponent(store.name)}`}
					class={twMerge(components.button({ size: 'md' }), 'col-span-2 w-full sm:w-auto justify-center sm:col-span-1 px-3 py-2.5 text-base sm:px-5 sm:py-3 sm:text-lg')}
				>
					<Icon name="list" />
					<span>Myymälän valikoima</span>
				</a>
				<button
					type="button"
					class={twMerge(
						components.button({ size: 'md', type: isPreferred ? 'positive' : 'primary' }),
						'col-span-2 w-full sm:w-auto justify-center sm:col-span-1 px-3 py-2.5 text-base sm:px-5 sm:py-3 sm:text-lg'
					)}
					disabled={isPreferred}
					onclick={() => selectPreferredStore(store)}
				>
					{isPreferred ? 'Ensisijainen myymälä' : 'Valitse ensisijaiseksi'}
				</button>
				<a
					href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(directionsQuery)}`}
					target="_blank"
					rel="noopener noreferrer"
					class={twMerge(components.button({ size: 'md' }), 'w-full sm:w-auto justify-center px-3 py-2.5 text-base sm:px-5 sm:py-3 sm:text-lg')}
				>
					<Icon name="map_pin" />
					<span class="sm:hidden">Kartta</span>
					<span class="hidden sm:inline">Näytä kartalla</span>
					<Icon name="link_external" />
				</a>
				<a
					href={`https://www.alko.fi/myymalat-palvelut/${store.id}`}
					target="_blank"
					rel="noopener noreferrer"
					referrerpolicy="no-referrer"
					class={twMerge(components.button({ size: 'md' }), 'w-full sm:w-auto justify-center px-3 py-2.5 text-base sm:px-5 sm:py-3 sm:text-lg')}
				>
					<span>Alkon sivu</span>
					<Icon name="link_external" />
				</a>
				<div class="col-span-2 empty:hidden sm:col-auto">
					<StoreCompass {store} />
				</div>
			</div>
		</header>

		<div class="grid grid-cols-1 items-start gap-6 md:grid-cols-5">
			<div class="flex flex-col gap-6 md:col-span-3">
				{#if additionalDetails.length}
					<section class="flex flex-col gap-2 rounded border border-primary bg-secondary p-4">
						<h2 class="text-xl font-bold">Lisätiedot</h2>
						{#each additionalDetails as detail (detail)}
							<p>{detail}</p>
						{/each}
					</section>
				{/if}
			</div>

			<section class="overflow-hidden rounded border border-primary bg-secondary md:col-span-2">
				<h2 class="border-b border-primary px-4 py-3 text-xl font-bold">Aukioloajat</h2>
				{#if store.openHours?.length}
					<ul>
						{#each store.openHours as openingHour (openingHour.date)}
							<li
								class={twMerge(
									'flex items-center justify-between gap-4 border-b border-primary px-4 py-3 last:border-b-0',
									openingHour.date === today && 'bg-primary font-semibold'
								)}
							>
								<span class="capitalize">{formatDate(openingHour.date)}</span>
								<strong>{openingHour.hours}</strong>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="px-4 py-3 text-secondary">Aukioloaikoja ei ole saatavilla.</p>
				{/if}
			</section>
		</div>
	</div>
{:else}
	<div class="mx-auto flex w-full max-w-[120ch] flex-col gap-6 p-4 md:p-6">
		{@render nav()}
		<div class="flex flex-col gap-2">
			<h1 class="text-2xl font-bold md:text-3xl">Myymälää ei löytynyt</h1>
			<p class="text-secondary">Valitettavasti myymälää ei löytynyt. Tarkista osoite ja yritä uudelleen.</p>
		</div>
	</div>
{/if}
