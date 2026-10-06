<script lang="ts">
	import { Kaljakori } from '$lib/alko';
	import type { AvailabilityData, PriceListItem } from '$lib/types';
	import { AllColumns, AUTO_STORE_ID } from '$lib/utils/constants';
	import {
		categoryDescription,
		categoryFeedPath,
		categorySlug,
		categoryTitle,
		type CategoryNode
	} from '$lib/utils/categories';
	import { generateTitle, setSEO } from '$lib/utils/helpers';
	import { formatValue } from '$lib/utils/format';
	import {
		compareProductIds,
		isLaptop,
		onlyPreferredStore,
		pageBottomBar,
		personalInfo,
		preferredStoreId,
		userLocation
	} from '$lib/global.svelte';
	import { resolvePreferredStore } from '$lib/utils/availability';
	import { keepAutoLocationFresh } from '$lib/utils/location';
	import { compareURL, MAX_COMPARE_PRODUCTS } from '$lib/utils/compare';
	import { pickCategoryHighlights } from '$lib/utils/metrics';
	import { twMerge } from 'tailwind-merge';
	import Main from './Main.svelte';
	import { components } from '$lib/utils/styles';
	import Icon from '../widgets/Icon.svelte';
	import Breadcrumb from '../widgets/Breadcrumb.svelte';
	import Popup from '../widgets/Popup.svelte';
	import BottomBar from '../widgets/BottomBar.svelte';
	import CategoryStats from '../category/CategoryStats.svelte';
	import CategoryPriceChanges from '../category/CategoryPriceChanges.svelte';
	import CategorySection from '../category/CategorySection.svelte';

	const {
		trail,
		table,
		availability,
		tree
	}: {
		trail: CategoryNode[];
		table: any[][];
		availability: AvailabilityData;
		tree: CategoryNode[];
	} = $props();

	const node = $derived(trail[trail.length - 1]);
	const parent = $derived(trail.length > 1 ? trail[0] : undefined);

	$effect(() => {
		if ($preferredStoreId === AUTO_STORE_ID) return keepAutoLocationFresh();
	});

	const preferredStore = $derived(
		resolvePreferredStore(availability.stores, $preferredStoreId, $userLocation)
	);
	const storeFilter = $derived($onlyPreferredStore && preferredStore ? preferredStore.id : undefined);

	// A Kaljakori of just this category, so the list, filter options and number
	// ranges all match the category instead of the whole selection. With the store
	// filter on, everything on the page (stats, price changes, highlights) follows it.
	const kaljakori = $derived.by(() => {
		const [header, ...rows] = table;
		const typeIndex = header.indexOf(AllColumns.Type);
		const subTypeIndex = header.indexOf(AllColumns.SubType);
		const numberIndex = header.indexOf(AllColumns.Number);
		const [type, subType] = trail;
		return new Kaljakori(
			[
				header,
				...rows.filter(
					(row) =>
						categorySlug(String(row[typeIndex] ?? '')) === type.slug &&
						(!subType || categorySlug(String(row[subTypeIndex] ?? '')) === subType.slug) &&
						(!storeFilter || (availability.product[String(row[numberIndex])] ?? []).includes(storeFilter))
				)
			],
			personalInfo,
			availability
		);
	});

	const active = $derived(
		kaljakori.data.filter((item) => item[AllColumns.RemovedFromSelection] !== true)
	);

	function best(key: typeof AllColumns.Price | typeof AllColumns.AlcoholGramsPerEuro, lowest: boolean) {
		let result: PriceListItem | undefined;
		for (const item of active) {
			const value = Number(item[key]);
			if (!Number.isFinite(value) || value <= 0) continue;
			if (!result || (lowest ? value < result[key] : value > result[key])) result = item;
		}
		return result;
	}

	const cheapest = $derived(best(AllColumns.Price, true));
	const mostAlcoholPerEuro = $derived(best(AllColumns.AlcoholGramsPerEuro, false));
	const onSaleCount = $derived(active.filter((item) => item[AllColumns.OnSale]).length);
	const newCount = $derived(active.filter((item) => item[AllColumns.New]).length);

	// Type pages list their subcategories, subcategory pages their siblings
	const chips = $derived(parent ? parent.children : node.children);
	const siblingTypes = $derived(parent ? [] : tree.filter((type) => type.slug !== node.slug));

	// The main list with this category preselected, for narrowing it down with the filters
	const filterHref = $derived.by(() => {
		const params = new URLSearchParams();
		params.set(AllColumns.Type, trail[0].name);
		if (trail[1]) params.set(AllColumns.SubType, trail[1].name);
		return `/?${params}`;
	});

	const feedPath = $derived(categoryFeedPath(trail[0].slug, trail[1]?.slug));

	// A few standout products to open side by side
	const compareHref = $derived.by(() => {
		const picks = pickCategoryHighlights(active, Math.min(4, MAX_COMPARE_PRODUCTS));
		return picks.length > 1 ? compareURL(picks.map((item) => item[AllColumns.Number])) : undefined;
	});

	const description = $derived(categoryDescription(trail));

	// Hand the mobile action bar to the layout; the sidebar footer covers wide screens
	$effect(() => {
		if (!$isLaptop) return;
		pageBottomBar.snippet = bottomBar;
		return () => {
			if (pageBottomBar.snippet === bottomBar) pageBottomBar.snippet = undefined;
		};
	});

	$effect(() => {
		const title = generateTitle(categoryTitle(trail));
		setSEO({
			description,
			og: { title, description, url: `https://alkometriikka.fi${node.path}` },
			twitter: { title, description },
			keywords: trail.map((item) => item.name).join(', ')
		});
	});
</script>

<svelte:head>
	<title>{generateTitle(categoryTitle(trail))}</title>
	<link
		rel="alternate"
		type="application/rss+xml"
		title={`${categoryTitle(trail)} – uutuudet ja hinnanmuutokset`}
		href={`${feedPath}.xml`}
	/>
</svelte:head>

{#snippet stat(label: string, value: string, product?: PriceListItem)}
	{@const content = `${product ? product[AllColumns.Name] : ''}`}
	<div class="flex min-w-0 flex-col gap-0.5 rounded border border-primary bg-primary px-3 py-2 text-sm">
		<span class="text-xs text-secondary">{label}</span>
		{#if product}
			<a href={`/tuotteet/${product[AllColumns.Number]}/`} class="truncate font-bold hover:underline" title={content}>
				{content}
			</a>
		{/if}
		<span>{value}</span>
	</div>
{/snippet}

<!-- Stat cards, stats and price changes: the sidebar on wide screens, the "Tiedot" sheet otherwise.
     Collapsed in the sidebar so it stays short, open in the sheet that was opened to see them. -->
{#snippet insights(inSheet: boolean)}
	<div class="flex flex-col">
		{#if cheapest || mostAlcoholPerEuro || onSaleCount > 0 || newCount > 0}
			<CategorySection title="Kohokohdat" open={inSheet}>
				<div class={twMerge('flex flex-col gap-2', inSheet && 'grid grid-cols-2')}>
					{#if cheapest}
						{@render stat('Halvin', formatValue(cheapest[AllColumns.Price], AllColumns.Price) as string, cheapest)}
					{/if}
					{#if mostAlcoholPerEuro}
						{@render stat(
							'Eniten alkoholia eurolla',
							formatValue(mostAlcoholPerEuro[AllColumns.AlcoholGramsPerEuro], AllColumns.AlcoholGramsPerEuro) as string,
							mostAlcoholPerEuro
						)}
					{/if}
					{#if onSaleCount > 0}
						{@render stat('Alennuksessa', `${onSaleCount} tuotetta`)}
					{/if}
					{#if newCount > 0}
						{@render stat('Uutuuksia', `${newCount} tuotetta`)}
					{/if}
				</div>
			</CategorySection>
		{/if}
		<CategoryStats products={active} open={inSheet} />
		<CategoryPriceChanges
			products={active}
			typeSlug={trail[0].slug}
			subTypeSlug={trail[1]?.slug}
			feedHref={`${feedPath}.xml`}
			open={inSheet}
		/>
	</div>
{/snippet}

{#snippet filterLink()}
	<a href={filterHref} class={twMerge(components.button(), 'flex-1')}>
		<Icon name="filter" />
		<span>Suodata tarkemmin</span>
	</a>
{/snippet}

{#snippet compareLink()}
	{#if compareHref}
		<a
			href={compareHref}
			title="Vertaile eniten alkoholia eurolla, halvimman hinnan ja halvimman litrahinnan tuotteita"
			class={twMerge(components.button(), 'flex-1')}
		>
			<Icon name="compare" />
			<span>Vertaile parhaita</span>
		</a>
	{/if}
{/snippet}

{#snippet header()}
	<div class="flex w-full flex-col gap-3">
		<Breadcrumb items={trail.slice(0, -1).map((item) => ({ label: item.name, href: item.path }))} current={node.name} />
		<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<h1 class="text-2xl font-bold">{node.name}</h1>
			<span class="text-sm text-secondary">
				{#if storeFilter}
					{active.length.toLocaleString('fi-FI')} / {node.count.toLocaleString('fi-FI')} tuotetta myymälässä
				{:else}
					{node.count.toLocaleString('fi-FI')} tuotetta valikoimassa
				{/if}
			</span>
		</div>
		{#if preferredStore}
			<label class="flex cursor-pointer items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={$onlyPreferredStore} class="shrink-0 rounded" />
				<span class="min-w-0 truncate">Vain myymälässäni: <strong>{preferredStore.name}</strong></span>
			</label>
		{:else if Object.keys(availability.stores).length}
			<a href="/myymalat" class="group flex items-center gap-1 text-sm text-secondary">
				<Icon name="map_pin" />
				<span class="group-hover:underline">Valitse myymälä nähdäksesi sen valikoiman</span>
			</a>
		{/if}
		{#if chips.length > 1 || siblingTypes.length}
			<div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:px-0 xl:overflow-visible">
				{#each chips as chip (chip.slug)}
					{@const selected = chip.slug === node.slug}
					<a
						href={chip.path}
						aria-current={selected ? 'page' : undefined}
						class={twMerge(
							'flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-sm',
							selected ? 'bg-brand-3 text-white' : 'border border-primary bg-primary hover:bg-secondary'
						)}
					>
						<span>{chip.name}</span>
						<span class={twMerge('rounded px-1 text-xs', selected ? 'bg-white/20' : 'bg-secondary text-secondary')}>
							{chip.count}
						</span>
					</a>
				{/each}
				{#each siblingTypes as type (type.slug)}
					<a
						href={type.path}
						class="flex shrink-0 items-center gap-1.5 rounded border border-dashed border-primary px-2.5 py-1 text-sm text-secondary hover:bg-secondary"
					>
						{type.name}
					</a>
				{/each}
			</div>
		{/if}
		{#if !$isLaptop}
			{@render insights(false)}
		{/if}
	</div>
{/snippet}

{#snippet footer()}
	<div class="flex flex-wrap gap-2">
		{@render filterLink()}
		{@render compareLink()}
	</div>
{/snippet}

<!-- Below the sidebar breakpoint the actions live in a bottom bar, the same as on product pages -->
{#snippet bottomBar()}
	<BottomBar class="xl:hidden">
		<Popup class="mb-0 max-h-[85dvh] w-full max-w-none gap-4 overflow-y-auto rounded-b-none p-4 open:starting:translate-y-full open:starting:scale-100 open:translate-y-0">
			{#snippet renderButton(dialogElement: HTMLDialogElement)}
				<button
					type="button"
					class={twMerge(components.button({ size: 'lg' }), 'h-11 flex-1')}
					onclick={() => dialogElement.showModal()}
				>
					<Icon name="info_circle" />
					<span>Tiedot</span>
				</button>
			{/snippet}
			{#snippet renderContent(dialogElement: HTMLDialogElement)}
				<h2 class="text-xl font-bold">{node.name}</h2>
				{@render insights(true)}
				<!-- Pinned to the bottom of the scrolling sheet, where the Tiedot button that opened it was -->
				<div class="sticky bottom-0 -mx-4 -mb-4 bg-primary px-4 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
					<button
						type="button"
						class={twMerge(components.button({ size: 'lg' }), 'h-11 w-full')}
						onclick={() => dialogElement.close()}
					>
						<Icon name="x" />
						<span>Sulje</span>
					</button>
				</div>
			{/snippet}
		</Popup>
		<a href={filterHref} class={twMerge(components.button({ size: 'lg' }), 'h-11 flex-1')}>
			<Icon name="filter" />
			<span>Suodata</span>
		</a>
		<!-- Hidden while the comparison bar is showing, so there's only one "compare" action on screen -->
		{#if compareHref && compareProductIds.length === 0}
			<a
				href={compareHref}
				title="Vertaile eniten alkoholia eurolla, halvimman hinnan ja halvimman litrahinnan tuotteita"
				class={twMerge(components.button({ size: 'lg' }), 'h-11 flex-1')}
			>
				<Icon name="compare" />
				<span>Parhaat</span>
			</a>
		{/if}
	</BottomBar>
{/snippet}

{#key `${node.path}|${storeFilter ?? ''}`}
	<Main {kaljakori} {header} footer={$isLaptop ? undefined : footer} showFilters={false} />
{/key}
