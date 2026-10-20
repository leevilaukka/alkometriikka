<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Kaljakori } from '$lib/alko';
	import { preferredStoreId, userLocation, watchlist } from '$lib/global.svelte';
	import type { AvailabilityData } from '$lib/types';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { staticPage } from '$lib/utils/app/seo';
	import { resolvePreferredStore } from '$lib/utils/catalog/availability';
	import { AUTO_STORE_ID } from '$lib/utils/constants/app';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { keepAutoLocationFresh } from '$lib/utils/device/location';
	import { formatValue } from '$lib/utils/format/format';
	import { components } from '$lib/utils/ui/styles';
	import {
		describeWatchChange,
		markWatchSeen,
		unwatchProduct,
		watchSnapshot,
		watchStatuses
	} from '$lib/utils/user/watchlist';
	import { onMount, untrack } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import Icon from '../widgets/Icon.svelte';
	import ProductImage from '../widgets/ProductImage.svelte';

	const { kaljakori, availability }: { kaljakori: Kaljakori; availability: AvailabilityData } =
		$props();

	const seo = staticPage('/seuratut/');
	setSEO({
		description: seo.description,
		og: {
			title: generateTitle(seo.title),
			description: seo.description,
			url: `https://alkometriikka.fi${seo.path}`
		},
		keywords: seo.keywords
	});

	$effect(() => {
		if ($preferredStoreId === AUTO_STORE_ID) return keepAutoLocationFresh();
	});

	const preferredStore = $derived(
		resolvePreferredStore(availability.stores, $preferredStoreId, $userLocation)
	);
	const byId = $derived(new Map(kaljakori.data.map((item) => [item[AllColumns.Number], item])));
	const statuses = $derived(
		watchStatuses(watchlist, (id) => byId.get(id), availability, preferredStore?.id)
	);
	const changedCount = $derived(statuses.filter((status) => status.changes.length).length);

	onMount(() => {
		untrack(() =>
			sendAnalyticsEvent('view_watchlist', { count: statuses.length, changed: changedCount })
		);
	});

	function markSeen(id: string) {
		const product = byId.get(id);
		if (product) markWatchSeen(id, watchSnapshot(product, availability, preferredStore?.id));
	}

	const storeName = (id: string) => availability.stores[id]?.name;
</script>

<svelte:head>
	<title>{generateTitle(seo.title)}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-6">
	<header class="flex flex-col gap-2">
		<h1 class="text-2xl font-bold md:text-3xl">Seuratut tuotteet</h1>
		<p class="text-secondary">
			Näet täällä, mikä seuraamissasi tuotteissa on muuttunut edellisen käyntisi jälkeen: hinta,
			saatavuus myymälöissä{preferredStore ? ` ja myymälässäsi ${preferredStore.name}` : ''}. Tiedot
			pysyvät vain tällä laitteella.
		</p>
		{#if changedCount > 0}
			<button
				type="button"
				class={twMerge(components.button({ size: 'md', type: 'positive' }), 'mt-1')}
				onclick={() => statuses.forEach((status) => markSeen(status.item.id))}
			>
				<Icon name="check" />
				<span>Merkitse kaikki nähdyiksi ({changedCount})</span>
			</button>
		{/if}
	</header>

	{#if statuses.length === 0}
		<section class="flex flex-col items-start gap-3 rounded border border-primary bg-secondary p-5">
			<p>Et seuraa vielä yhtään tuotetta.</p>
			<p class="text-sm text-secondary">
				Avaa tuotesivu ja paina <strong>Seuraa</strong>. Kun tuotteen hinta muuttuu tai se tulee
				myymälääsi, näet sen täällä ja etusivulla.
			</p>
			<a href={resolve('/')} class={components.button({ size: 'md' })}>
				<Icon name="search" />
				<span>Selaa tuotteita</span>
			</a>
		</section>
	{:else}
		<ul class="flex flex-col gap-3">
			{#each statuses as { item, product, changes } (item.id)}
				<li
					class={twMerge(
						'flex gap-3 rounded border bg-secondary p-3',
						changes.length ? 'border-green-600' : 'border-primary'
					)}
				>
					{#if product}
						<div class="flex h-20 w-16 shrink-0 items-center justify-center rounded bg-white p-1.5">
							<ProductImage
								number={product[AllColumns.Number]}
								name={product[AllColumns.Name]}
								alt=""
								class="h-full w-full object-contain"
							/>
						</div>
						<div class="flex min-w-0 flex-1 flex-col gap-1">
							<a
								href={resolve(`/tuotteet/${item.id}/`)}
								class="font-bold hover:underline"
								title={product[AllColumns.Name]}>{product[AllColumns.Name]}</a
							>
							<span class="text-sm text-secondary">
								{formatValue(product[AllColumns.Price], AllColumns.Price)} · {formatValue(
									product[AllColumns.BottleSize],
									AllColumns.BottleSize
								)}
								{#if product[AllColumns.RemovedFromSelection]}
									· Poistunut valikoimasta
								{:else if preferredStore}
									· {(availability.product[item.id] ?? []).includes(preferredStore.id)
										? 'Myymälässäsi'
										: 'Ei myymälässäsi'}
								{/if}
							</span>
							{#if changes.length}
								<ul class="flex flex-wrap gap-1.5">
									{#each changes as change, index (index)}
										{@const label = describeWatchChange(change, storeName)}
										<li class={components.badge({ color: label.good ? 'green' : 'red' })}>
											{label.text}
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{:else}
						<div class="flex min-w-0 flex-1 flex-col gap-1">
							<span class="font-bold">Tuote {item.id}</span>
							<span class="text-sm text-secondary">Tuotetta ei enää löydy hinnastosta.</span>
						</div>
					{/if}
					<div class="flex shrink-0 flex-col gap-1.5">
						{#if changes.length}
							<button
								type="button"
								class={components.button()}
								title="Merkitse muutokset nähdyiksi"
								onclick={() => markSeen(item.id)}
							>
								<Icon name="check" />
								<span class="hidden sm:inline">Nähty</span>
							</button>
						{/if}
						<button
							type="button"
							class={components.button()}
							title="Lopeta seuraaminen"
							aria-label="Lopeta seuraaminen"
							onclick={() => unwatchProduct(item.id)}
						>
							<Icon name="bell_off" />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
