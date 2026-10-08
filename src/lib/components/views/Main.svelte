<script lang="ts">
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	import type { ColumnNames, ListObj, PriceListItem } from '$lib/types';
	import {
		shownColumnsToHighlight,
		defaultSortingColumn,
		AllColumns,
		shownSortingKeys,
		defaultSortingOrderMap,
		ContextKeys
	} from '$lib/utils/constants';
	import { components } from '$lib/utils/styles';
	import { headerToDisplayName, sortingOrderToString } from '$lib/utils/helpers';
	import Icon from '../widgets/Icon.svelte';
	import type { Kaljakori } from '$lib/alko';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import { addToList } from '$lib/utils/lists';
	import { isLaptop, isMobile, pageBottomBar, searchQuery } from '$lib/global.svelte';
	import Filters from '../widgets/Filters.svelte';
	import { initFilterValues } from '$lib/utils/filters';
	import { page } from '$app/state';
	import { getContext, onMount, untrack, type Snippet } from 'svelte';
	import type { SearchParamsManager } from '$lib/utils/url';
	import ProductPreview from '../widgets/ProductPreview.svelte';
	import BottomBar from '../widgets/BottomBar.svelte';
	import FilterButton from '../widgets/FilterButton.svelte';

	const {
		kaljakori,
		header,
		footer,
		showFilters = true
	}: { kaljakori: Kaljakori; header?: Snippet; footer?: Snippet; showFilters?: boolean } = $props();

	// Without the filter sidebar, wide screens show the header in a sidebar of its own
	const sidebarHeader = $derived(!!header && !showFilters && !$isLaptop);

	let searchParamsManager = getContext<SearchParamsManager>(ContextKeys.SearchParamsManager);

	let listRef: SvelteVirtualList<PriceListItem> | null = $state(null);

	let filtersComponent: Filters | null = $state(null);
	let showRemoved = $state(false);
	let filterValues = $state(
		untrack(() =>
			initFilterValues(kaljakori, showFilters ? page.url.searchParams : undefined, showRemoved)
		)
	);
	let activeFilters: ColumnNames[] = $state([]);

	let selectedHighlight = $state(
		searchParamsManager.getParameter('highlight') || defaultSortingColumn
	) as ColumnNames;
	let selectedSortingColumn = $state(
		searchParamsManager.getParameter('sort') || defaultSortingColumn
	) as ColumnNames;
	let asc: boolean = $derived(
		defaultSortingOrderMap[selectedSortingColumn as keyof typeof defaultSortingOrderMap] || false
	);

	let rows = $derived.by(() => {
		let filterValuesCopy: Record<string, any> = { ...filterValues };
		Object.keys(filterValuesCopy).forEach((key) => {
			if (
				Array.isArray(filterValuesCopy[key]) &&
				kaljakori.getFilterType(key as ColumnNames) !== 'number'
			)
				filterValuesCopy[key] = new Set(filterValuesCopy[key]);
		});
		let temp = kaljakori.fuzzySearchAndFilter($searchQuery, filterValuesCopy);
		if (!showRemoved) temp = temp.filter((item) => item[AllColumns.RemovedFromSelection] !== true);
		if (!!selectedSortingColumn)
			temp = temp.sort((a, b) => (a[selectedSortingColumn] > b[selectedSortingColumn] ? 1 : -1));
		if (!asc) temp = temp.reverse();
		return temp;
	});

	// A new search, filter or sort gives a different list, so start it from the top. The
	// virtual list keeps the old scroll position otherwise, and once a short result list
	// has scrolled it to the bottom it stays pinned there as more results come back.
	let listInputs: string | undefined;
	$effect(() => {
		const inputs = JSON.stringify(
			[$searchQuery, $state.snapshot(filterValues), selectedSortingColumn, asc, showRemoved],
			(_, value) => (value instanceof Set ? [...value] : value)
		);
		if (listInputs !== undefined && inputs !== listInputs)
			untrack(() => listRef)?.scroll({ index: 0, smoothScroll: false });
		listInputs = inputs;
	});

	let highlightMax = $derived.by(() => {
		if (!selectedHighlight) return null;
		const maxValue = rows.reduce((max, item) => {
			const value = Number(item[selectedHighlight] ?? 0);
			return value > max ? value : max;
		}, 0);
		return maxValue > 0 ? maxValue : null;
	});

	function skipToResults(event: MouseEvent) {
		event.preventDefault();
		document.getElementById('results')?.focus();
	}

	onMount(() => {
		const ascParam = searchParamsManager.getParameter('asc') === 'true';
		if (ascParam !== asc) asc = ascParam;
	});

	$effect(() => {
		searchParamsManager.setParameter('q', $searchQuery);
		selectedHighlight !== defaultSortingColumn
			? searchParamsManager.setParameter('highlight', selectedHighlight)
			: searchParamsManager.setParameter('highlight', '');
		selectedSortingColumn !== defaultSortingColumn
			? searchParamsManager.setParameter('sort', selectedSortingColumn)
			: searchParamsManager.setParameter('sort', '');
		asc !== !!defaultSortingOrderMap[selectedSortingColumn as keyof typeof defaultSortingOrderMap]
			? searchParamsManager.setParameter('asc', String(asc))
			: searchParamsManager.setParameter('asc', '');
		searchParamsManager.update();
	});

	// On phones the filter toggle lives in a bottom bar, next to where the filter dialog's own
	// close and clear buttons are, instead of above the list
	$effect(() => {
		if (!$isMobile || !showFilters) return;
		pageBottomBar.snippet = filterBar;
		return () => {
			if (pageBottomBar.snippet === filterBar) pageBottomBar.snippet = undefined;
		};
	});
</script>

{#snippet filterBar()}
	<BottomBar class="md:hidden">
		<FilterButton
			activeCount={activeFilters.length}
			onclick={() => filtersComponent?.toggleFilterElement()}
		/>
	</BottomBar>
{/snippet}

<div
	class={twMerge(
		'relative grid h-full max-h-full overflow-hidden',
		showFilters ? 'grid-cols-[auto_1fr]' : 'bg-secondary',
		!showFilters && (sidebarHeader ? 'grid-cols-[20rem_1fr]' : 'grid-cols-1')
	)}
>
	{#if sidebarHeader}
		<aside class="flex max-h-full flex-col overflow-hidden border-e border-primary bg-primary">
			<div class="flex flex-auto flex-col gap-3 overflow-y-auto p-4">
				{@render header?.()}
			</div>
			{#if footer}
				<div class="border-t border-primary p-4">
					{@render footer()}
				</div>
			{/if}
		</aside>
	{/if}
	{#if showFilters}
		<aside
			class="z-10 flex h-full max-h-full flex-col overflow-hidden border-primary md:w-84 md:border-r"
		>
			<a
				href="#results"
				onclick={skipToResults}
				class="sr-only bg-primary px-4 py-2 font-bold focus:not-sr-only">Ohita suodattimet</a
			>
			<Filters
				{kaljakori}
				bind:activeFilters
				bind:filterValues
				bind:showRemoved
				bind:this={filtersComponent}
			/>
		</aside>
	{/if}
	<!-- Without the filter sidebar, match the product page's width so rows don't stretch -->
	<main
		id="results"
		tabindex="-1"
		class={twMerge(
			'mx-auto flex h-full w-full flex-col gap-3 bg-secondary p-4 outline-none md:gap-4 md:p-6',
			!showFilters && !sidebarHeader && 'max-w-7xl'
		)}
	>
		{#if header && !sidebarHeader}
			{@render header()}
			{@render footer?.()}
		{:else if !header}
			<h1 class="sr-only">Alkon tuotteet</h1>
		{/if}
		<div class="flex w-full flex-col items-start gap-4">
			<div class={twMerge('grid w-full grid-cols-2 items-end gap-2 md:w-fit')}>
				<div class="flex flex-col">
					<label for={'sortingColumn'} class="text-sm">
						{'Järjestys'}
					</label>
					<div class="flex flex-row flex-nowrap">
						<select
							name="sortingColumn"
							id="sortingColumn"
							bind:value={selectedSortingColumn}
							class={twMerge(components.input(), 'w-full rounded-none rounded-s pe-8')}
						>
							{#each shownSortingKeys as filter}
								{@const hasValues = kaljakori.getFilterValues(filter).length > 0}
								{#if hasValues}
									<option value={filter}>{headerToDisplayName(filter)}</option>
								{/if}
							{/each}
						</select>
						{#if selectedSortingColumn}
							<button
								onclick={() => {
									asc = !asc;
									listRef?.scroll({ index: 0, smoothScroll: false });
								}}
								aria-label={`Järjestys: ${sortingOrderToString(asc, selectedSortingColumn)}`}
								class={twMerge(components.button(), 'rounded-none rounded-e border-s-0')}
							>
								<span class="hidden whitespace-nowrap md:block">
									{sortingOrderToString(asc, selectedSortingColumn)}
								</span>
								<Icon name={asc ? 'up_arrow_alt' : 'down_arrow_alt'} />
							</button>
						{/if}
					</div>
				</div>
				<div class="flex flex-col">
					<label for={'selectedHighlight'} class="text-sm"> Korostus </label>
					<select
						name="selectedHighlight"
						id="selectedHighlight"
						bind:value={selectedHighlight}
						class={twMerge(components.input(), 'w-full pe-8')}
					>
						{#each shownColumnsToHighlight as filter}
							{@const hasValues = kaljakori.getFilterValues(filter).length > 0}
							{#if hasValues}
								<option value={filter}>{headerToDisplayName(filter)}</option>
							{/if}
						{/each}
					</select>
				</div>
			</div>
		</div>
		<div class="flex flex-row flex-wrap items-center justify-between gap-2">
			<p>Tulosten määrä: {rows.length}</p>
			<button
				onclick={() => {
					listRef?.scroll({ index: 0, smoothScroll: false });
				}}
				class={twMerge(components.button())}
			>
				<Icon name={'arrow_to_top'} />
				<span>{$isMobile ? 'Alkuun' : 'Hyppää alkuun'}</span>
			</button>
		</div>
		<div class="flex min-h-0 flex-auto flex-col">
			<SvelteVirtualList items={rows} bind:this={listRef} itemsClass={'flex flex-col gap-3'}>
				{#snippet renderItem(item, idx: number)}
					<ProductPreview product={item} highlight={selectedHighlight} {kaljakori} {highlightMax}>
						{#snippet renderExtras()}
							<div
								class="absolute top-0 left-0 flex flex-nowrap items-center gap-0.5 rounded-br bg-gray-100 px-1.5 py-0.5 text-sm text-secondary dark:bg-zinc-700"
							>
								<Icon name="hashtag" />
								<span>{`${idx + 1}`}</span>
							</div>
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
											addToList(list, item[AllColumns.Number]);
											dialogElement.close();
										}}
									/>
								{/snippet}
							</Popup>
						{/snippet}
					</ProductPreview>
				{/snippet}
			</SvelteVirtualList>
		</div>
		{#if rows.length == 0}
			<p>Ei tuloksia</p>
		{/if}
	</main>
</div>
