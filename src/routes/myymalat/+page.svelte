<script lang="ts">
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { preferredStoreId } from '$lib/global.svelte';
	import { AUTO_STORE_ID } from '$lib/utils/constants';
	import { requestUserLocation } from '$lib/utils/location';
	import type { AvailabilityStore } from '$lib/types';
	import { getStoreCity, isStoreOpen } from '$lib/utils/availability.js';
	import { generateTitle, sendAnalyticsEvent, setSEO } from '$lib/utils/helpers';
	import { staticPage } from '$lib/utils/seo';
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';

	let { data } = $props();
	let query = $state('');

	function formatAddress(store: AvailabilityStore) {
		return [store.address, [store.postalCode, store.postOffice].filter(Boolean).join(' ')]
			.filter(Boolean)
			.join(', ');
	}

	function selectPreferredStore(store: AvailabilityStore) {
		$preferredStoreId = store.id;
		sendAnalyticsEvent('preferred_store_changed', {
			storeId: store.id,
			storeName: store.name,
			city: getStoreCity(store),
		});
	}

	const { description, keywords } = staticPage('/myymalat/');
	setSEO({
		og: { title: generateTitle('Myymälät'), description, url: window.location.href },
		keywords,
		description
	});
</script>

<svelte:head>
	<title>{generateTitle('Myymälät')}</title>
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
	{@const stores = Object.values(alko.availability.stores).sort((first, second) =>
		first.name.localeCompare(second.name, 'fi')
	)}
	{@const normalizedQuery = query.trim().toLocaleLowerCase('fi-FI')}
	{@const filteredStores = stores.filter((store) =>
		[store.name, store.address, store.postalCode, store.postOffice]
			.filter(Boolean)
			.join(' ')
			.toLocaleLowerCase('fi-FI')
			.includes(normalizedQuery)
	)}
	

	<div class="mx-auto flex w-full max-w-[120ch] flex-col gap-6 p-6">
		<header class="flex flex-col gap-2">
			<h1 class="text-2xl font-bold md:text-3xl">Myymälät</h1>
			<p class="text-secondary">Selaa Alkon myymälöitä ja valitse ensisijainen myymälä.</p>
		</header>

		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class={components.button({ type: $preferredStoreId === AUTO_STORE_ID ? 'positive' : 'primary' })}
				disabled={$preferredStoreId === AUTO_STORE_ID}
				onclick={() => {
					$preferredStoreId = AUTO_STORE_ID;
					requestUserLocation();
					sendAnalyticsEvent('preferred_store_changed', { storeId: AUTO_STORE_ID, storeName: 'Auto' });
				}}
			>
				{$preferredStoreId === AUTO_STORE_ID ? 'Automaattinen valinta käytössä' : 'Valitse lähin myymälä automaattisesti'}
			</button>
			<a href="/kompassi" class={components.button({ size: 'md' })}>
				<Icon name="compass" />
				<span>Kompassi lähimpään myymälään</span>
			</a>
		</div>

		<label class="flex flex-col gap-2" for="store-search">
			<span class="font-semibold">Hae myymälää</span>
			<input
				id="store-search"
				type="search"
				bind:value={query}
				placeholder="Nimi, osoite tai postinumero"
				class={twMerge(components.input({ size: 'md' }), 'w-full')}
			/>
		</label>

		<section class="overflow-hidden rounded border border-primary bg-secondary">
			<div class="border-b border-primary px-4 py-3 text-sm text-secondary">
				{filteredStores.length} myymälää
			</div>
			{#if filteredStores.length}
				<ul>
					{#each filteredStores as store (store.id)}
						{@const address = formatAddress(store)}
						{@const storeOpen = isStoreOpen(store)}
						<li class="flex flex-col gap-3 border-b border-primary px-4 py-3 last:border-b-0 sm:flex-row sm:items-center">
							<a href={`/myymalat/${store.id}/`} class="min-w-0 flex-1 hover:underline">
								<span class="block font-semibold">{store.name}</span>
								{#if address}
									<span class="block text-sm text-secondary">{address}</span>
								{/if}
							</a>
							<div class="flex items-center justify-between gap-3 sm:justify-end">
								<span
									class={storeOpen
										? 'rounded bg-green-100 px-2 py-1 text-sm text-green-800 dark:bg-green-900 dark:text-green-100'
										: 'rounded bg-gray-100 px-2 py-1 text-sm text-gray-700 dark:bg-zinc-700 dark:text-zinc-100'}
								>
									{storeOpen ? 'Avoinna' : 'Suljettu'}
								</span>
								<button
									type="button"
									class={twMerge(
										components.button({ size: 'sm', type: store.id === $preferredStoreId ? 'positive' : 'primary' }),
										'shrink-0'
									)}
									disabled={store.id === $preferredStoreId}
									onclick={() => selectPreferredStore(store)}
								>
									{store.id === $preferredStoreId ? 'Valittu' : 'Valitse'}
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="px-4 py-3 text-secondary">Hakua vastaavia myymälöitä ei löytynyt.</p>
			{/if}
		</section>
	</div>
{/await}