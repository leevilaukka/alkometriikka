<script lang="ts">
	import { page } from '$app/state';
	import { getContext, untrack } from 'svelte';
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import type { Kaljakori } from '$lib/alko';
	import type { AvailabilityData, ListObj } from '$lib/types';
	import { AllColumns, AUTO_STORE_ID, ContextKeys } from '$lib/utils/constants';
	import { categoryFeedPath, categoryTitle, type CategoryNode } from '$lib/utils/categories';
	import { generateTitle, sendAnalyticsEvent, setSEO } from '$lib/utils/helpers';
	import { formatValue } from '$lib/utils/format';
	import { staticPage } from '$lib/utils/seo';
	import { recentPriceChanges, type PriceChange } from '$lib/utils/metrics';
	import {
		countPriceChangesByCategory,
		filterPriceChangesByDirection,
		formatPriceChangeAmount,
		formatPriceChangeDate,
		formatPriceChangePercent,
		isInCategory,
		isPriceDrop,
		parsePriceChangeParams,
		priceChangeParams,
		priceChangeSince,
		DEFAULT_PRICE_CHANGE_WINDOW,
		PRICE_CHANGE_WINDOWS,
		type PriceChangeDirection
	} from '$lib/utils/priceChanges';
	import type { SearchParamsManager } from '$lib/utils/url';
	import {
		isLaptop,
		onlyPreferredStore,
		pageBottomBar,
		preferredStoreId,
		searchQuery,
		userLocation
	} from '$lib/global.svelte';
	import { resolvePreferredStore } from '$lib/utils/availability';
	import { keepAutoLocationFresh } from '$lib/utils/location';
	import { addToList } from '$lib/utils/lists';
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';
	import Icon from '../widgets/Icon.svelte';
	import Breadcrumb from '../widgets/Breadcrumb.svelte';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import ProductPreview from '../widgets/ProductPreview.svelte';
	import BottomBar from '../widgets/BottomBar.svelte';
	import FilterButton from '../widgets/FilterButton.svelte';

	const { kaljakori, availability }: { kaljakori: Kaljakori; availability: AvailabilityData } = $props();

	const TITLE = 'Hinnanmuutokset';
	const { description: DESCRIPTION, keywords: KEYWORDS } = staticPage('/hinnanmuutokset/');
	const SITE_FEED = 'https://alkometriikka.fi/rss.xml';

	const searchParamsManager = getContext<SearchParamsManager>(ContextKeys.SearchParamsManager);

	const initial = untrack(() => parsePriceChangeParams(page.url.searchParams));
	let days = $state<number>(initial.days);
	let direction = $state<PriceChangeDirection>(initial.direction);
	let typeSlug = $state(initial.typeSlug);
	let subTypeSlug = $state(initial.subTypeSlug);

	let listRef: SvelteVirtualList<PriceChange | null> | null = $state(null);

	const tree = $derived(kaljakori.getCategoryTree());
	const typeNode = $derived(tree.find((node) => node.slug === typeSlug));
	const subTypeNode = $derived(typeNode?.children.find((node) => node.slug === subTypeSlug));
	const trail = $derived([typeNode, subTypeNode].filter((node): node is CategoryNode => !!node));

	$effect(() => {
		if ($preferredStoreId === AUTO_STORE_ID) return keepAutoLocationFresh();
	});

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

	// Below the sidebar breakpoint (the same as the category page's) the title scrolls away
	// with the list as its first row, leaving the cards room for the change tab
	const rows = $derived($isLaptop ? [null, ...changes] : changes);

	// A new set of changes starts from the top of the list
	$effect(() => {
		void changes;
		// Untracked as a whole, since scrolling reads the list's own scroll state
		untrack(() => listRef?.scroll({ index: 0, smoothScroll: false }));
	});

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

	// The store toggle is a setting of its own, so it neither counts as a filter nor gets cleared
	const activeFilterCount = $derived(
		[typeNode, subTypeNode, direction !== 'all', days !== DEFAULT_PRICE_CHANGE_WINDOW].filter(Boolean).length
	);

	function clearFilters() {
		selectType(undefined);
		direction = 'all';
		days = DEFAULT_PRICE_CHANGE_WINDOW;
	}

	// Below the sidebar breakpoint the filters open in a sheet from the bottom bar, like on the category page
	$effect(() => {
		if (!$isLaptop) return;
		pageBottomBar.snippet = bottomBar;
		return () => {
			if (pageBottomBar.snippet === bottomBar) pageBottomBar.snippet = undefined;
		};
	});

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
			keywords: KEYWORDS
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

<!-- The sidebar on wide screens, the top of the list otherwise -->
{#snippet intro()}
	<div class="flex flex-col gap-3">
		<Breadcrumb items={[]} current={TITLE} />
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl font-bold">{TITLE}</h1>
			<p class="text-sm text-secondary">
				Alkon valikoiman tuotteet, joiden hinta on muuttunut viime aikoina. Jokaisesta tuotteesta näytetään
				sen viimeisin muutos, uusimmat ensin.
			</p>
		</div>
	</div>
{/snippet}

<!-- The sidebar on wide screens, a sheet opened from the bottom bar otherwise -->
{#snippet filters()}
	<div class="flex flex-col gap-3">
		<div class="flex flex-col gap-1">
			<span id="price-change-type" class="text-sm">Kategoria</span>
			<div class="flex flex-wrap gap-2" role="group" aria-labelledby="price-change-type">
				{@render chip('Kaikki', searched.length, !typeNode, () => selectType(undefined))}
				{#each tree as type (type.slug)}
					{@const count = categoryCounts.get(type.slug) ?? 0}
					{#if count > 0 || type.slug === typeNode?.slug}
						{@render chip(type.name, count, type.slug === typeNode?.slug, () => selectType(type.slug))}
					{/if}
				{/each}
			</div>
		</div>
		{#if typeNode && typeNode.children.length}
			<div class="flex flex-col gap-1">
				<span id="price-change-subtype" class="text-sm">Tyyppi</span>
				<div class="flex flex-wrap gap-2" role="group" aria-labelledby="price-change-subtype">
					{@render chip(`Kaikki ${typeNode.name.toLocaleLowerCase('fi-FI')}`, categoryCounts.get(typeNode.slug) ?? 0, !subTypeNode, () => (subTypeSlug = undefined))}
					{#each typeNode.children as child (child.slug)}
						{@const count = categoryCounts.get(`${typeNode.slug}/${child.slug}`) ?? 0}
						{#if count > 0 || child.slug === subTypeNode?.slug}
							{@render chip(child.name, count, child.slug === subTypeNode?.slug, () => (subTypeSlug = child.slug))}
						{/if}
					{/each}
				</div>
			</div>
		{/if}

		<div class="flex flex-col gap-1">
			<span id="price-change-direction" class="text-sm">Suunta</span>
			<div class="flex overflow-hidden rounded border border-primary" role="group" aria-labelledby="price-change-direction">
				{#each directions as option (option.value)}
					{@render segment(option.label, direction === option.value, () => (direction = option.value))}
				{/each}
			</div>
		</div>
		<div class="flex flex-col gap-1">
			<span id="price-change-window" class="text-sm">Aikaväli</span>
			<div class="flex overflow-hidden rounded border border-primary" role="group" aria-labelledby="price-change-window">
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
{/snippet}

{#snippet summary()}
	<div class="flex flex-row flex-wrap items-center justify-between gap-2">
		<p class="text-sm text-secondary">
			{#if query}{`Haku ”${$searchQuery.trim()}”: `}{/if}{inCategory.length.toLocaleString('fi-FI')} tuotetta
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
					onclick={() => sendAnalyticsEvent('click_feed', { feed: 'category', location: 'price_changes' })}
					title="Tilaa kategorian uutuudet ja hinnanmuutokset RSS-syötteenä"
				>
					<Icon name="rss" />
					<span class="group-hover:underline">Kategorian RSS</span>
				</a>
			{/if}
			<a
				href={SITE_FEED}
				class="group flex items-center gap-1"
				onclick={() => sendAnalyticsEvent('click_feed', { feed: 'site', location: 'price_changes' })}
				title="Tilaa koko valikoiman uutuudet ja hinnanmuutokset RSS-syötteenä"
			>
				<Icon name="rss" />
				<span class="group-hover:underline">RSS</span>
			</a>
			{#if !$isLaptop && changes.length > 0}
				<button
					onclick={() => listRef?.scroll({ index: 0, smoothScroll: false })}
					class={twMerge(components.button())}
				>
					<Icon name="arrow_to_top" />
					<span>Hyppää alkuun</span>
				</button>
			{/if}
		</div>
	</div>
{/snippet}

<!-- The change itself, as a tab on the left edge of the product card, or a strip across its top on phones -->
{#snippet changeTab(change: PriceChange)}
	{@const cheaper = isPriceDrop(change)}
	<div
		class={twMerge(
			'flex shrink-0 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-primary px-4 py-2 text-sm md:w-32 md:flex-col md:justify-center md:gap-1 md:border-e md:border-b-0 md:px-2 md:py-4 md:text-center',
			cheaper ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
		)}
	>
		<span class="flex items-center gap-1.5 md:flex-col md:gap-1">
			<span class="md:text-2xl"><Icon name={cheaper ? 'trending_down' : 'trending_up'} /></span>
			<strong class="leading-tight md:text-3xl">{formatPriceChangePercent(change.percent)}</strong>
		</span>
		<span class="font-semibold">{formatPriceChangeAmount(change)}</span>
		<span class="md:text-xs">oli {formatValue(change.from, AllColumns.Price)}</span>
		<span class="text-secondary md:text-xs">{formatPriceChangeDate(change.date)}</span>
		{#if change.sale}
			<span class={twMerge(components.badge({ color: 'green' }), 'md:text-xs')}>Tarjous</span>
		{/if}
	</div>
{/snippet}

{#snippet bottomBar()}
	<BottomBar class="xl:hidden">
		<Popup class="mb-0 max-h-[85dvh] w-full max-w-none gap-4 overflow-y-auto rounded-b-none p-4 open:starting:translate-y-full open:starting:scale-100 open:translate-y-0">
			{#snippet renderButton(dialogElement: HTMLDialogElement)}
				<FilterButton activeCount={activeFilterCount} onclick={() => dialogElement.showModal()} />
			{/snippet}
			{#snippet renderContent(dialogElement: HTMLDialogElement)}
				<h2 class="text-xl font-bold">Suodattimet</h2>
				{@render filters()}
				<!-- Pinned to the bottom of the scrolling sheet, where the button that opened it was -->
				<div class="sticky bottom-0 -mx-4 -mb-4 flex gap-2.5 bg-primary px-4 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
					{#if activeFilterCount > 0}
						<button
							type="button"
							class={twMerge(components.button({ size: 'lg', type: 'negative' }), 'h-11 flex-1')}
							onclick={clearFilters}
						>
							<Icon name="x_circle" />
							<span>Tyhjennä</span>
						</button>
					{/if}
					<button
						type="button"
						class={twMerge(components.button({ size: 'lg' }), 'h-11 flex-1')}
						onclick={() => dialogElement.close()}
					>
						<Icon name="x" />
						<span>Sulje</span>
					</button>
				</div>
			{/snippet}
		</Popup>
	</BottomBar>
{/snippet}

<div class={twMerge('relative grid h-full max-h-full overflow-hidden', $isLaptop ? 'grid-cols-1' : 'grid-cols-[auto_1fr]')}>
	{#if !$isLaptop}
		<aside class="flex max-h-full w-84 flex-col gap-3 overflow-y-auto border-e border-primary bg-primary p-4">
			{@render intro()}
			{@render filters()}
		</aside>
	{/if}
	<main id="results" tabindex="-1" class="flex h-full w-full min-w-0 flex-col gap-3 overflow-y-auto bg-secondary p-4 outline-none md:gap-4 md:p-6">
		{#if !$isLaptop}
			{@render summary()}
		{/if}
		{#if changes.length === 0}
			{#if $isLaptop}
				{@render intro()}
				{@render summary()}
			{/if}
			<div class="flex flex-col items-start gap-2 rounded border border-primary bg-primary p-4 text-sm">
				<p>Ei hinnanmuutoksia valituilla rajauksilla.</p>
				{#if typeNode || direction !== 'all' || query}
					<button type="button" class="cursor-pointer text-secondary hover:underline" onclick={resetFilters}>
						Näytä kaikki muutokset
					</button>
				{/if}
			</div>
		{:else}
			<div class="flex min-h-0 flex-auto flex-col">
				<SvelteVirtualList items={rows} bind:this={listRef} itemsClass={'flex flex-col gap-3'}>
					{#snippet renderItem(change)}
						{#if change === null}
							<div class="flex flex-col gap-3 pb-1">
								{@render intro()}
								{@render summary()}
							</div>
						{:else}
							<ProductPreview product={change.product} {kaljakori}>
								{#snippet renderAside()}
									{@render changeTab(change)}
								{/snippet}
								{#snippet renderExtras()}
									<Popup class="gap-4 p-4">
										{#snippet renderButton(dialogElement: HTMLDialogElement)}
											<button
												class={twMerge(components.button({ type: 'positive' }), 'ml-auto')}
												onclick={() => dialogElement.showModal()}
											>
												<span>Lisää listaan</span>
												<Icon name="plus" />
											</button>
										{/snippet}
										{#snippet renderContent(dialogElement: HTMLDialogElement)}
											<h2 class="text-xl">Valitse lista</h2>
											<AllLists
												action={(list: ListObj) => {
													addToList(list, change.product[AllColumns.Number]);
													dialogElement.close();
												}}
											/>
										{/snippet}
									</Popup>
								{/snippet}
							</ProductPreview>
						{/if}
					{/snippet}
				</SvelteVirtualList>
			</div>
		{/if}
	</main>
</div>
