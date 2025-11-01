<script lang="ts">
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	import type { ColumnNames, ListObj, PriceListItem } from '$lib/types';
	import {
		filterToUnitMarker,
		shownColumnsToHighlight,
		defaultSortingColumn,
		AllColumns,
		shownSortingKeys,
		defaultSortingOrderMap,
		ContextKeys
	} from '$lib/utils/constants';
	import { components } from '$lib/utils/styles';
	import {
		formatValue,
		headerToDisplayName,
		sortingOrderToString,
		valueToString
	} from '$lib/utils/helpers';
	import Icon from '../widgets/Icon.svelte';
	import type { Kaljakori } from '$lib/alko';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import { addToList } from '$lib/utils/lists';
	import { isMobile, searchQuery } from '$lib/global.svelte';
	import Filters from '../widgets/Filters.svelte';
	import { initFilterValues } from '$lib/utils/filters';
	import { page } from '$app/state';
	import BadgeList from '../widgets/BadgeList.svelte';
	import { getContext, onMount } from 'svelte';
	import type { SearchParamsManager } from '$lib/utils/url';
	import ProductImage from '../widgets/ProductImage.svelte';
	import ProductPreview from '../widgets/ProductPreview.svelte';

	const { kaljakori }: { kaljakori: Kaljakori } = $props();

	let searchParamsManager = getContext<SearchParamsManager>(ContextKeys.SearchParamsManager);

	let listRef: SvelteVirtualList<PriceListItem> | null = $state(null);

	let filtersComponent: Filters | null = $state(null);
	let filterValues = $state(initFilterValues(kaljakori, page.url.searchParams));
	let activeFilters: ColumnNames[] = $state([])

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
		if (!!selectedSortingColumn)
			temp = temp.sort((a, b) => (a[selectedSortingColumn] > b[selectedSortingColumn] ? 1 : -1));
		if (!asc) temp = temp.reverse();
		return temp;
	});

	onMount(() => {
		const ascParam = searchParamsManager.getParameter('asc') === "true";
		if(ascParam !== asc) asc = ascParam
	});

	$effect(() => {
		searchParamsManager.setParameter('q', $searchQuery);
		selectedHighlight !== defaultSortingColumn ? searchParamsManager.setParameter('highlight', selectedHighlight) : searchParamsManager.setParameter('highlight', "");
		selectedSortingColumn !== defaultSortingColumn ? searchParamsManager.setParameter('sort', selectedSortingColumn) : searchParamsManager.setParameter('sort', "");
		asc !== !!defaultSortingOrderMap[selectedSortingColumn as keyof typeof defaultSortingOrderMap] ? searchParamsManager.setParameter('asc', String(asc)) : searchParamsManager.setParameter('asc', "");
		searchParamsManager.update();
	});
</script>

<div class="relative grid h-full grid-cols-[auto_1fr] max-h-full overflow-hidden">
	<aside
		class="z-10 flex h-full flex-col max-h-full overflow-hidden border-gray-300 md:w-84 md:border-r"
	>
		<Filters {kaljakori} bind:activeFilters bind:filterValues bind:this={filtersComponent} />
	</aside>
	<main class="mx-auto flex h-full w-full flex-col gap-3 bg-gray-50 p-4 md:gap-4 md:p-6">
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
				{#if $isMobile}
					<button
						onclick={() => {
							filtersComponent?.toggleFilterElement();
						}}
						class={twMerge(components.button(), 'col-span-full w-full')}
					>
						<span>Näytä suodattimet {activeFilters.length > 0 ? `(${activeFilters.length} valittu)` : ""}</span>
					
						<Icon name={'filter'} />
					</button>
				{/if}
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
		<div class="flex flex-auto flex-col">
			<SvelteVirtualList items={rows} bind:this={listRef} itemsClass={'flex flex-col gap-3'}>
				{#snippet renderItem(item, idx: number)}
					<ProductPreview product={item} highlight={selectedHighlight} {kaljakori}>
						{#snippet renderExtras()}
							<div
								class="absolute top-0 left-0 flex flex-nowrap items-center gap-0.5 rounded-br bg-gray-100 px-1.5 py-0.5 text-sm text-gray-500"
							>
								<Icon name="hashtag" />
								<span>{`${(idx + 1)}`}</span>
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
