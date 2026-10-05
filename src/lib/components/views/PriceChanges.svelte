<script lang="ts">
	import { page } from '$app/state';
	import { getContext, untrack } from 'svelte';
	import type { Kaljakori } from '$lib/alko';
	import type { AvailabilityData } from '$lib/types';
	import { AllColumns, ContextKeys } from '$lib/utils/constants';
	import { categoryFeedPath, categoryTitle, type CategoryNode } from '$lib/utils/categories';
	import { generateTitle, setSEO } from '$lib/utils/helpers';
	import { recentPriceChanges } from '$lib/utils/metrics';
	import {
		countPriceChangesByCategory,
		filterPriceChangesByDirection,
		isInCategory,
		isPriceDrop,
		parsePriceChangeParams,
		priceChangeParams,
		priceChangeSince,
		PRICE_CHANGE_WINDOWS,
		type PriceChangeDirection
	} from '$lib/utils/priceChanges';
	import type { SearchParamsManager } from '$lib/utils/url';
	import { onlyPreferredStore, preferredStoreId, searchQuery, userLocation } from '$lib/global.svelte';
	import { resolvePreferredStore } from '$lib/utils/availability';
	import { twMerge } from 'tailwind-merge';
	import Icon from '../widgets/Icon.svelte';
	import Breadcrumb from '../widgets/Breadcrumb.svelte';
	import PriceChangeList from '../widgets/PriceChangeList.svelte';

	const { kaljakori, availability }: { kaljakori: Kaljakori; availability: AvailabilityData } = $props();

	const TITLE = 'Hinnanmuutokset';
	const DESCRIPTION =
		'Alkon tuotteiden viimeisimmät hinnanmuutokset: mitkä tuotteet halpenivat ja mitkä kallistuivat. Rajaa tyypin, myymälän ja aikavälin mukaan.';
	const SITE_FEED = 'https://alkometriikka.fi/rss.xml';
	/** Rows rendered at a time; a 90-day window can have thousands of changes. */
	const PAGE_SIZE = 100;

	const searchParamsManager = getContext<SearchParamsManager>(ContextKeys.SearchParamsManager);

	const initial = untrack(() => parsePriceChangeParams(page.url.searchParams));
	let days = $state<number>(initial.days);
	let direction = $state<PriceChangeDirection>(initial.direction);
	let typeSlug = $state(initial.typeSlug);
	let subTypeSlug = $state(initial.subTypeSlug);

	const tree = $derived(kaljakori.getCategoryTree());
	const typeNode = $derived(tree.find((node) => node.slug === typeSlug));
	const subTypeNode = $derived(typeNode?.children.find((node) => node.slug === subTypeSlug));
	const trail = $derived([typeNode, subTypeNode].filter((node): node is CategoryNode => !!node));

	const preferredStore = $derived(
		resolvePreferredStore(availability.stores, $preferredStoreId, $userLocation)
	);
	const storeFilter = $derived($onlyPreferredStore && preferredStore ? preferredStore.id : undefined);

	// Every change in the window, before the category, direction and name filters,
	// so the chips can show how many each choice has
	const allChanges = $derived.by(() => {
		const products = kaljakori.data.filter(
			(item) =>
				item[AllColumns.RemovedFromSelection] !== true &&
				(!storeFilter || (availability.product[item[AllColumns.Number]] ?? []).includes(storeFilter))
		);
		return recentPriceChanges(products, priceChangeSince(days));
	});

	const query = $derived($searchQuery.trim().toLocaleLowerCase('fi-FI'));
	const searched = $derived(
		query
			? allChanges.filter((change) =>
					String(change.product[AllColumns.Name] ?? '')
						.toLocaleLowerCase('fi-FI')
						.includes(query)
				)
			: allChanges
	);
	const categoryCounts = $derived(countPriceChangesByCategory(searched));
	const inCategory = $derived(
		searched.filter((change) => isInCategory(change.product, typeNode?.slug, subTypeNode?.slug))
	);
	const drops = $derived(inCategory.filter(isPriceDrop).length);
	const changes = $derived(filterPriceChangesByDirection(inCategory, direction));

	const directions: { value: PriceChangeDirection; label: string }[] = [
		{ value: 'all', label: 'Kaikki' },
		{ value: 'down', label: 'Halventuneet' },
		{ value: 'up', label: 'Kallistuneet' }
	];

	function selectType(slug?: string) {
		typeSlug = slug;
		subTypeSlug = undefined;
	}

	function resetFilters() {
		selectType(undefined);
		direction = 'all';
		$searchQuery = '';
	}

	// Keep the choices in the URL so a filtered view can be shared
	$effect(() => {
		searchParamsManager
			.setParametersFromObject(
				priceChangeParams({ days, direction, typeSlug: typeNode?.slug, subTypeSlug: subTypeNode?.slug })
			)
			.setParameter('q', $searchQuery);
		searchParamsManager.update();
	});

	$effect(() => {
		const title = generateTitle(TITLE);
		setSEO({
			description: DESCRIPTION,
			og: { title, description: DESCRIPTION, url: 'https://alkometriikka.fi/hinnanmuutokset' },
			twitter: { title, description: DESCRIPTION },
			keywords: 'hinnanmuutokset, hinnanalennukset, hinnankorotukset, Alko, hinnat'
		});
	});
</script>

<svelte:head>
	<title>{generateTitle(TITLE)}</title>
	<link rel="alternate" type="application/rss+xml" title="Alkometriikka – uutuudet ja hinnanmuutokset" href={SITE_FEED} />
</svelte:head>

{#snippet chip(label: string, count: number, selected: boolean, onclick: () => void)}
	<button
		type="button"
		aria-pressed={selected}
		{onclick}
		class={twMerge(
			'flex shrink-0 cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 text-sm',
			selected ? 'bg-brand-3 text-white' : 'border border-primary bg-primary hover:bg-secondary'
		)}
	>
		<span>{label}</span>
		<span class={twMerge('rounded px-1 text-xs', selected ? 'bg-white/20' : 'bg-secondary text-secondary')}>
			{count.toLocaleString('fi-FI')}
		</span>
	</button>
{/snippet}

{#snippet segment(label: string, selected: boolean, onclick: () => void)}
	<button
		type="button"
		aria-pressed={selected}
		{onclick}
		class={twMerge(
			'flex-1 cursor-pointer whitespace-nowrap border-s border-primary px-2.5 py-1.5 text-sm first:border-s-0 md:py-1',
			selected ? 'bg-brand-3 text-white' : 'bg-primary hover:bg-secondary'
		)}
	>
		{label}
	</button>
{/snippet}

<main class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 md:p-6">
	<Breadcrumb items={[]} current={TITLE} />
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-bold">{TITLE}</h1>
		<p class="text-sm text-secondary">
			Alkon valikoiman tuotteet, joiden hinta on muuttunut viime aikoina. Jokaisesta tuotteesta näytetään
			sen viimeisin muutos, uusimmat ensin.
		</p>
	</div>

	<div class="flex flex-col gap-3">
		<div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Tyyppi">
			{@render chip('Kaikki', searched.length, !typeNode, () => selectType(undefined))}
			{#each tree as type (type.slug)}
				{@const count = categoryCounts.get(type.slug) ?? 0}
				{#if count > 0 || type.slug === typeNode?.slug}
					{@render chip(type.name, count, type.slug === typeNode?.slug, () => selectType(type.slug))}
				{/if}
			{/each}
		</div>
		{#if typeNode && typeNode.children.length}
			<div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Alatyyppi">
				{@render chip(`Kaikki ${typeNode.name.toLocaleLowerCase('fi-FI')}`, categoryCounts.get(typeNode.slug) ?? 0, !subTypeNode, () => (subTypeSlug = undefined))}
				{#each typeNode.children as child (child.slug)}
					{@const count = categoryCounts.get(`${typeNode.slug}/${child.slug}`) ?? 0}
					{#if count > 0 || child.slug === subTypeNode?.slug}
						{@render chip(child.name, count, child.slug === subTypeNode?.slug, () => (subTypeSlug = child.slug))}
					{/if}
				{/each}
			</div>
		{/if}

		<div class="flex flex-wrap gap-2">
			<div class="flex min-w-0 flex-auto overflow-hidden rounded border border-primary sm:flex-none" role="group" aria-label="Suunta">
				{#each directions as option (option.value)}
					{@render segment(option.label, direction === option.value, () => (direction = option.value))}
				{/each}
			</div>
			<div class="flex flex-auto overflow-hidden rounded border border-primary sm:flex-none" role="group" aria-label="Aikaväli">
				{#each PRICE_CHANGE_WINDOWS as value (value)}
					{@render segment(`${value} pv`, days === value, () => (days = value))}
				{/each}
			</div>
		</div>

		{#if preferredStore}
			<label class="flex cursor-pointer items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={$onlyPreferredStore} class="shrink-0 rounded" />
				<span class="min-w-0 truncate">Vain myymälässäni: <strong>{preferredStore.name}</strong></span>
			</label>
		{:else if Object.keys(availability.stores).length}
			<a href="/myymalat" class="group flex w-fit items-center gap-1 text-sm text-secondary">
				<Icon name="map_pin" />
				<span class="group-hover:underline">Valitse myymälä nähdäksesi sen valikoiman</span>
			</a>
		{/if}
	</div>

	<section class="flex flex-col gap-2">
		<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
			<p class="text-sm text-secondary">
				{#if query}Haku ”{$searchQuery.trim()}”: {/if}{inCategory.length.toLocaleString('fi-FI')} tuotetta
				{days} päivän aikana: {drops.toLocaleString('fi-FI')} halpeni, {(inCategory.length - drops).toLocaleString('fi-FI')} kallistui
			</p>
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-secondary">
				{#if typeNode}
					<a href={(subTypeNode ?? typeNode).path} class="group flex items-center gap-1">
						<span class="group-hover:underline">{categoryTitle(trail)}</span>
						<Icon name="chevron_right" />
					</a>
					<a
						href={`${categoryFeedPath(typeNode.slug, subTypeNode?.slug)}.xml`}
						class="group flex items-center gap-1"
						title="Tilaa kategorian uutuudet ja hinnanmuutokset RSS-syötteenä"
					>
						<Icon name="rss" />
						<span class="group-hover:underline">Kategorian RSS</span>
					</a>
				{/if}
				<a
					href={SITE_FEED}
					class="group flex items-center gap-1"
					title="Tilaa koko valikoiman uutuudet ja hinnanmuutokset RSS-syötteenä"
				>
					<Icon name="rss" />
					<span class="group-hover:underline">RSS</span>
				</a>
			</div>
		</div>
		{#if changes.length === 0}
			<div class="flex flex-col items-start gap-2 rounded border border-primary bg-primary p-4 text-sm">
				<p>Ei hinnanmuutoksia valituilla rajauksilla.</p>
				{#if typeNode || direction !== 'all' || query}
					<button type="button" class="cursor-pointer text-secondary hover:underline" onclick={resetFilters}>
						Näytä kaikki muutokset
					</button>
				{/if}
			</div>
		{:else}
			<PriceChangeList {changes} pageSize={PAGE_SIZE} />
		{/if}
	</section>
</main>
