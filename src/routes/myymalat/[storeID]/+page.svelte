<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import StoreCompass from '$lib/components/widgets/StoreCompass.svelte';
	import { preferredStoreId } from '$lib/global.svelte';
	import type { AvailabilityStore } from '$lib/types';
	import {
		formatOpeningHours,
		getStoreCity,
		isStoreOpen,
		storeName,
		storeText
	} from '$lib/utils/catalog/availability.js';
	import { alkoStoreUrl } from '$lib/utils/app/alkoLinks';
	import { intlLocale, m } from '$lib/i18n';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { storeDescription } from '$lib/utils/app/seo';
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';

	let { data } = $props();

	function formatDate(date: string) {
		return new Intl.DateTimeFormat(intlLocale, {
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
			city: getStoreCity(store)
		});
	}

	$effect(
		() =>
			data.store &&
			setSEO({
				og: {
					title: generateTitle(m.store_page_title({ name: storeName(data.store) })),
					description: storeDescription(data.store),
					url: window.location.href,
					type: 'website'
				},
				keywords: `Alko, myymälä, ${data.store.name}, ${data.store.address}, ${data.store.postalCode}, ${data.store.postOffice}`,
				description: storeDescription(data.store)
			})
	);
</script>

<svelte:head>
	<title
		>{generateTitle(m.store_page_title({ name: data.store ? storeName(data.store) : '' }))}</title
	>
</svelte:head>

{#snippet nav()}
	<nav class="flex items-center gap-2">
		<a href={resolve('/')} class={twMerge(components.button({ size: 'md' }))}>
			<Icon name="home" class="inline-block" />
			<span>{m.common_to_home()}</span>
		</a>
		<a href={resolve('/myymalat/')} class={twMerge(components.button({ size: 'md' }))}>
			<Icon name="map_pin" />
			<span>{m.nav_stores()}</span>
		</a>
	</nav>
{/snippet}

{#if data.store}
	{@const store = data.store}
	{@const address = [
		storeText(store, 'address'),
		[store.postalCode, storeText(store, 'postOffice')].filter(Boolean).join(' ')
	]
		.filter(Boolean)
		.join(', ')}
	{@const directionsQuery = ['Alko', store.name, address].filter(Boolean).join(', ')}
	{@const additionalDetails = [
		storeText(store, 'additional_info'),
		storeText(store, 'location_details'),
		storeText(store, 'unobstructured'),
		storeText(store, 'exceptions')
	].filter((detail): detail is string => Boolean(detail?.trim()))}
	{@const storeOpen = isStoreOpen(store)}
	{@const today = new Date().toLocaleDateString('sv-SE')}
	{@const isPreferred = store.id === $preferredStoreId}

	<div class="mx-auto flex w-full max-w-[120ch] flex-col gap-6 p-4 md:p-6">
		{@render nav()}

		<header class="flex flex-col gap-4 rounded border border-primary bg-secondary p-5 md:p-6">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="flex flex-col gap-1">
					<h1 class="text-2xl font-bold md:text-4xl">{storeName(store)}</h1>
					{#if address}
						<p class="text-lg">{address}</p>
					{/if}
					<span class="text-sm text-secondary">{m.store_number({ id: store.id })}</span>
				</div>
				<span
					class={twMerge(
						'shrink-0 rounded px-3 py-1 text-sm font-semibold',
						storeOpen
							? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
							: 'bg-gray-100 text-gray-700 dark:bg-zinc-700 dark:text-zinc-100'
					)}
				>
					{storeOpen ? m.store_open() : m.store_closed_now()}
				</span>
			</div>

			<div
				class="grid grid-cols-2 gap-2 border-t border-primary pt-4 sm:flex sm:flex-wrap sm:gap-3"
			>
				<a
					href={resolve(`/?${AllColumns.StoreAvailability}=${encodeURIComponent(store.name)}`)}
					class={twMerge(
						components.button({ size: 'md' }),
						'col-span-2 w-full justify-center px-3 py-2.5 text-base sm:col-span-1 sm:w-auto sm:px-5 sm:py-3 sm:text-lg'
					)}
				>
					<Icon name="list" />
					<span>{m.store_selection()}</span>
				</a>
				<button
					type="button"
					class={twMerge(
						components.button({ size: 'md', type: isPreferred ? 'positive' : 'primary' }),
						'col-span-2 w-full justify-center px-3 py-2.5 text-base sm:col-span-1 sm:w-auto sm:px-5 sm:py-3 sm:text-lg'
					)}
					disabled={isPreferred}
					onclick={() => selectPreferredStore(store)}
				>
					{isPreferred ? m.personal_preferred_store() : m.store_set_preferred()}
				</button>
				<a
					href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(directionsQuery)}`}
					target="_blank"
					rel="noopener noreferrer"
					class={twMerge(
						components.button({ size: 'md' }),
						'w-full justify-center px-3 py-2.5 text-base sm:w-auto sm:px-5 sm:py-3 sm:text-lg'
					)}
				>
					<Icon name="map_pin" />
					<span class="sm:hidden">{m.store_map_short()}</span>
					<span class="hidden sm:inline">{m.store_map()}</span>
					<Icon name="link_external" />
				</a>
				<a
					href={alkoStoreUrl(store.id)}
					target="_blank"
					rel="noopener noreferrer"
					referrerpolicy="no-referrer"
					class={twMerge(
						components.button({ size: 'md' }),
						'w-full justify-center px-3 py-2.5 text-base sm:w-auto sm:px-5 sm:py-3 sm:text-lg'
					)}
				>
					<span>{m.store_alko_page()}</span>
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
						<h2 class="text-xl font-bold">{m.store_more_info()}</h2>
						{#each additionalDetails as detail (detail)}
							<p>{detail}</p>
						{/each}
					</section>
				{/if}
			</div>

			<section class="overflow-hidden rounded border border-primary bg-secondary md:col-span-2">
				<h2 class="border-b border-primary px-4 py-3 text-xl font-bold">
					{m.store_opening_hours()}
				</h2>
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
								<strong>{formatOpeningHours(openingHour.hours)}</strong>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="px-4 py-3 text-secondary">{m.store_no_opening_hours()}</p>
				{/if}
			</section>
		</div>
	</div>
{:else}
	<div class="mx-auto flex w-full max-w-[120ch] flex-col gap-6 p-4 md:p-6">
		{@render nav()}
		<div class="flex flex-col gap-2">
			<h1 class="text-2xl font-bold md:text-3xl">{m.store_not_found_title()}</h1>
			<p class="text-secondary">{m.store_not_found_description()}</p>
		</div>
	</div>
{/if}
