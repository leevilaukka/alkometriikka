<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { preferredStoreId } from '$lib/global.svelte';
	import { AUTO_STORE_ID } from '$lib/utils/constants/app';
	import { requestUserLocation } from '$lib/utils/device/location';
	import type { AvailabilityStore } from '$lib/types';
	import {
		getStoreCity,
		isStoreOpen,
		storeName,
		storeText
	} from '$lib/utils/catalog/availability.js';
	import { intlLocale, locale, m } from '$lib/i18n';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { staticPage } from '$lib/utils/app/seo';
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';

	let { data } = $props();
	let query = $state('');

	function formatAddress(store: AvailabilityStore) {
		return [
			storeText(store, 'address'),
			[store.postalCode, storeText(store, 'postOffice')].filter(Boolean).join(' ')
		]
			.filter(Boolean)
			.join(', ');
	}

	function selectPreferredStore(store: AvailabilityStore) {
		$preferredStoreId = store.id;
		sendAnalyticsEvent('preferred_store_changed', {
			storeId: store.id,
			storeName: store.name,
			city: getStoreCity(store)
		});
	}

	const { description, keywords } = staticPage('/myymalat/', locale);
	setSEO({
		og: { title: generateTitle(m.nav_stores()), description, url: window.location.href },
		keywords,
		description
	});
</script>

<svelte:head>
	<title>{generateTitle(m.nav_stores())}</title>
</svelte:head>

{#await data.alkoWithStores}
	<div class="grid h-full w-full place-content-center">
		<div class="flex flex-col items-center gap-3">
			<span
				class="block h-16 w-16 animate-spin rounded-full border-[0.5rem] border-red-600 border-b-transparent"
			></span>
			<p>{m.common_loading()}</p>
		</div>
	</div>
{:then alko}
	{@const stores = Object.values(alko.availability.stores).sort((first, second) =>
		storeName(first).localeCompare(storeName(second), intlLocale)
	)}
	{@const normalizedQuery = query.trim().toLocaleLowerCase(intlLocale)}
	{@const filteredStores = stores.filter((store) =>
		[
			store.name,
			store.address,
			store.postalCode,
			store.postOffice,
			store.name_sv,
			store.address_sv,
			store.postOffice_sv
		]
			.filter(Boolean)
			.join(' ')
			.toLocaleLowerCase(intlLocale)
			.includes(normalizedQuery)
	)}

	<div class="mx-auto flex w-full max-w-[120ch] flex-col gap-6 p-6">
		<header class="flex flex-col gap-2">
			<h1 class="text-2xl font-bold md:text-3xl">{m.nav_stores()}</h1>
			<p class="text-secondary">{m.stores_intro()}</p>
		</header>

		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class={components.button({
					type: $preferredStoreId === AUTO_STORE_ID ? 'positive' : 'primary'
				})}
				disabled={$preferredStoreId === AUTO_STORE_ID}
				onclick={() => {
					$preferredStoreId = AUTO_STORE_ID;
					requestUserLocation();
					sendAnalyticsEvent('preferred_store_changed', {
						storeId: AUTO_STORE_ID,
						storeName: 'Auto'
					});
				}}
			>
				{$preferredStoreId === AUTO_STORE_ID ? m.stores_auto_on() : m.stores_auto_choose()}
			</button>
			<a href={resolve('/kompassi/')} class={components.button({ size: 'md' })}>
				<Icon name="compass" />
				<span>{m.stores_compass_link()}</span>
			</a>
		</div>

		<label class="flex flex-col gap-2" for="store-search">
			<span class="font-semibold">{m.stores_search()}</span>
			<input
				id="store-search"
				type="search"
				bind:value={query}
				placeholder={m.stores_search_placeholder()}
				class={twMerge(components.input({ size: 'md' }), 'w-full')}
			/>
		</label>

		<section class="overflow-hidden rounded border border-primary bg-secondary">
			<div class="border-b border-primary px-4 py-3 text-sm text-secondary">
				{m.stores_count({ count: filteredStores.length })}
			</div>
			{#if filteredStores.length}
				<ul>
					{#each filteredStores as store (store.id)}
						{@const address = formatAddress(store)}
						{@const storeOpen = isStoreOpen(store)}
						<li
							class="flex flex-col gap-3 border-b border-primary px-4 py-3 last:border-b-0 sm:flex-row sm:items-center"
						>
							<a href={resolve(`/myymalat/${store.id}/`)} class="min-w-0 flex-1 hover:underline">
								<span class="block font-semibold">{storeName(store)}</span>
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
									{storeOpen ? m.store_open() : m.store_closed_now()}
								</span>
								<button
									type="button"
									class={twMerge(
										components.button({
											size: 'sm',
											type: store.id === $preferredStoreId ? 'positive' : 'primary'
										}),
										'shrink-0'
									)}
									disabled={store.id === $preferredStoreId}
									onclick={() => selectPreferredStore(store)}
								>
									{store.id === $preferredStoreId ? m.stores_selected() : m.stores_select()}
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="px-4 py-3 text-secondary">{m.stores_none_found()}</p>
			{/if}
		</section>
	</div>
{/await}
