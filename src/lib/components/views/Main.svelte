<script lang="ts" module>
	/** A row of the list and how far it was scrolled past the top of the list, in pixels */
	export type ListPosition = { index: number; offset: number };
</script>

<script lang="ts">
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	import type { ColumnNames, ListObj, PriceListItem } from '$lib/types';
	import {
		shownColumnsToHighlight,
		defaultSortingColumn,
		shownSortingKeys,
		defaultSortingOrderMap
	} from '$lib/utils/constants/display';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { ContextKeys } from '$lib/utils/constants/app';
	import { components } from '$lib/utils/ui/styles';
	import { headerToDisplayName, sortingOrderToString } from '$lib/utils/format/labels';
	import Icon from '../widgets/Icon.svelte';
	import type { Kaljakori } from '$lib/alko';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import { addToList } from '$lib/utils/user/lists';
	import { isLaptop, isMobile, pageBottomBar, searchQuery } from '$lib/global.svelte';
	import Filters from '../widgets/Filters.svelte';
	import { initFilterValues } from '$lib/utils/catalog/filters';
	import { getContext, untrack, type Snippet } from 'svelte';
	import type { SearchParamsManager } from '$lib/utils/app/url';
	import ProductPreview from '../widgets/ProductPreview.svelte';
	import BottomBar from '../widgets/BottomBar.svelte';
	import FilterButton from '../widgets/FilterButton.svelte';

	const {
		kaljakori,
		header,
		footer,
		showFilters = true,
		position
	}: {
		kaljakori: Kaljakori;
		header?: Snippet;
		footer?: Snippet;
		showFilters?: boolean;
		/** Where to scroll the list to, e.g. one saved by `currentPosition` before leaving the page */
		position?: ListPosition;
	} = $props();

	// Without the filter sidebar, wide screens show the header in a sidebar of its own
	const sidebarHeader = $derived(!!header && !showFilters && !$isLaptop);

	let searchParamsManager = getContext<SearchParamsManager>(ContextKeys.SearchParamsManager);

	let listRef: SvelteVirtualList<PriceListItem> | null = $state(null);
	let listElement: HTMLDivElement | undefined = $state();
	let restoring = $state(false);

	function listViewport() {
		return listElement?.querySelector<HTMLElement>('[data-svl-viewport]');
	}

	/** The row at the top of the list's viewport, so going back to the page can return to it */
	export function currentPosition(): ListPosition {
		const viewport = listViewport();
		if (!viewport) return { index: 0, offset: 0 };
		const top = viewport.getBoundingClientRect().top;
		const item = [...viewport.querySelectorAll<HTMLElement>('[data-svl-item]')].find(
			(element) => element.getBoundingClientRect().bottom > top
		);
		if (!item) return { index: 0, offset: 0 };
		return {
			index: Number(item.dataset.originalIndex),
			offset: Math.round(top - item.getBoundingClientRect().top)
		};
	}

	// The list scrolls inside its own viewport, so the browser's own scroll restoration
	// doesn't reach it. The position can arrive after the list has mounted (the page restores
	// its snapshot once navigation finishes), so this waits for both. Getting there takes a
	// couple of steps, so the list stays hidden until it's in place instead of jumping.
	$effect(() => {
		if (!listRef || !position) return;
		const list = listRef;
		const { index, offset } = position;
		// Untracked, since scrolling reads the list's own scroll state
		untrack(async () => {
			restoring = true;
			try {
				await list.scroll({ index, align: 'top', smoothScroll: false, shouldThrowOnBounds: false });
				// Rows the list hasn't measured yet are only estimated, so line the row up by where it
				// actually landed
				const viewport = listViewport();
				const item = viewport?.querySelector(`[data-original-index="${index}"]`);
				if (!viewport || !item) return;
				const landed = item.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
				await list.scrollToOffset({
					offset: viewport.scrollTop + landed + offset,
					smoothScroll: false
				});
			} finally {
				restoring = false;
			}
		});
	});

	let filtersComponent: Filters | null = $state(null);
	let showRemoved = $state(
		untrack(() => showFilters && searchParamsManager.getParameter('removed') === 'true')
	);
	let filterValues = $state(
		untrack(() =>
			initFilterValues(kaljakori, showFilters ? searchParamsManager.params : undefined, showRemoved)
		)
	);
	let activeFilters: ColumnNames[] = $state([]);

	let selectedHighlight = $state(
		searchParamsManager.getParameter('highlight') || defaultSortingColumn
	) as ColumnNames;
	let selectedSortingColumn = $state(
		searchParamsManager.getParameter('sort') || defaultSortingColumn
	) as ColumnNames;
	// The URL only carries `asc` when it differs from the column's default order, so a
	// missing parameter means the default. A linked order applies to the linked column only;
	// picking another column falls back to that column's default.
	let linkedAsc = searchParamsManager.getParameter('asc');
	let asc: boolean = $derived.by(() => {
		const fallback =
			!!defaultSortingOrderMap[selectedSortingColumn as keyof typeof defaultSortingOrderMap];
		if (linkedAsc === null) return fallback;
		const value = linkedAsc === 'true';
		linkedAsc = null;
		return value;
	});

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
		searchParamsManager.setParameter('removed', showRemoved ? 'true' : '');
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
				resultCount={rows.length}
			/>
		</aside>
	{/if}
	<!-- Without the filter sidebar, match the product page's width so rows don't stretch -->
	<div
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
		<div
			class={twMerge('flex min-h-0 flex-auto flex-col', restoring && 'invisible')}
			bind:this={listElement}
		>
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
	</div>
</div>
