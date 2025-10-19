<script lang="ts">
	import { generateImageUrl } from '$lib/utils/image.js';
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
		ColumnToBadgeMap,
		DatasetColumns,
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

	const { kaljakori }: { kaljakori: Kaljakori } = $props();

	let searchParamsManager = getContext<SearchParamsManager>(ContextKeys.SearchParamsManager);

	let listRef: SvelteVirtualList<PriceListItem> | null = $state(null);

	let filtersComponent: Filters | null = $state(null);
	let filterValues = $state(initFilterValues(kaljakori, page.url.searchParams));

	let selectedHighlight = $state(
		searchParamsManager.getParameter('highlight') || defaultSortingColumn
	);
	let selectedSortingColumn = $state(
		searchParamsManager.getParameter('sort') || defaultSortingColumn
	);
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
		<Filters {kaljakori} bind:filterValues bind:this={filtersComponent} />
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
						<span>Näytä suodattimet</span>
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
					{@const [_, max] = kaljakori.getMinAndMaxValues(selectedHighlight) as number[]}
					{@const multiplier = Number(item[selectedHighlight]) / max}
					{@const ratings = ['Matala', 'Kohtalainen', 'Korkea']}
					{@const rating = ratings[Number(((ratings.length - 1) * multiplier).toFixed(0))]}
					<div
						class={twMerge(
							'relative flex flex-col gap-3 overflow-clip rounded border border-gray-200 bg-white'
						)}
					>
						<div
							class={twMerge('flex flex-col flex-nowrap items-center gap-4 p-4 pb-0 md:flex-row')}
						>
							<div class="flex aspect-square w-40 max-w-[10rem] md:h-full md:w-auto md:max-w-fit shrink-0 p-1">
								<img
									src={generateImageUrl(item[AllColumns.Number], item[AllColumns.Name])}
									alt={item[AllColumns.Name]}
									class="block h-full w-full object-contain"
								/>
							</div>
							<div class="flex w-full flex-col gap-2">
								<div class="flex flex-row items-center gap-3">
									<div
										class="absolute top-0 left-0 flex flex-nowrap items-center gap-0.5 rounded-br bg-gray-100 px-1.5 py-0.5 text-sm text-gray-500"
									>
										<Icon name="hashtag" />
										<span>{`${(idx + 1)}`}</span>
									</div>
									<a href={`/tuotteet/${item[AllColumns.Number]}`} class="hover:underline">
										<h2 class="text-xl font-bold md:text-2xl">
											{item[AllColumns.Name]} ({formatValue(
												item[AllColumns.BottleSize],
												AllColumns.BottleSize
											)})
										</h2>
									</a>
								</div>
								<div class="flex flex-col items-start gap-0.5 md:flex-row md:gap-3">
									<div class="flex flex-col gap-0.5 md:gap-1">
										<p>{valueToString(item[AllColumns.Manufacturer], AllColumns.Manufacturer)}</p>
										<p>
											{valueToString(item[AllColumns.Type], AllColumns.Type)}
											{item[AllColumns.Type] === 'Oluet'
												? `- ${formatValue(item[AllColumns.BeerType], AllColumns.BeerType)}`
												: null}
										</p>
										<p>{valueToString(item[AllColumns.SubType], AllColumns.SubType)}</p>
									</div>
									<div class="flex flex-col gap-0.5 md:gap-1">
										<p>
											{valueToString(
												item[AllColumns.AlcoholPercentage],
												AllColumns.AlcoholPercentage
											)}
										</p>
										<p>
											{valueToString(
												item[AllColumns.AlcoholGramsPerEuro],
												AllColumns.AlcoholGramsPerEuro
											)}
										</p>
										<p>
											{valueToString(
												item[AllColumns.EstimatedPromille],
												AllColumns.EstimatedPromille
											)}
										</p>
									</div>
								</div>
								<div class="flex items-center gap-2 text-sm text-gray-500">
									<Icon name="map_pin" />
									<span class="text-sm">
										{item[AllColumns.Country]}
										{item[AllColumns.Region] ? ` - ${item[AllColumns.Region]}` : null}
									</span>
								</div>
								<div class="flex flex-col gap-4 lg:flex-row lg:items-center">
									<div class="flex items-center gap-2">
										<p class="text-3xl font-bold drop-shadow-lg">
											{Number.parseFloat(item[AllColumns.Price] as string).toFixed(2)} €
										</p>
										<span class="text-sm text-gray-500">
											({item[AllColumns.PricePerLiter]} €/L)
										</span>
									</div>
									<div class="flex flex-row items-center gap-3">
										<BadgeList {item} />
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
								</div>
							</div>
						</div>
						<div class="relative block max-w-full">
							<div
								class="relative flex h-full w-fit shrink-0 flex-nowrap items-center gap-1 bg-black px-1.5 py-0.5 text-sm whitespace-nowrap text-white"
								style={`left: ${100 * multiplier}%; transform: translateX(-${100 * multiplier}%);`}
							>
								<p>
									{headerToDisplayName(selectedHighlight)}: {item[selectedHighlight]}
									{filterToUnitMarker[selectedHighlight as keyof typeof filterToUnitMarker]}
								</p>
								<span>- {rating}</span>
							</div>
							<div
								class="relative block h-4 w-full rounded-b bg-gradient-to-r from-brand-1 from-10% via-amber-400 to-green-500"
							>
								<div
									class="absolute block h-full w-1 shrink-0 -translate-x-1/2 bg-black whitespace-nowrap"
									style={`left: ${100 * multiplier}%; transform: translateX(${50 - 100 * multiplier}%);`}
								></div>
							</div>
						</div>
					</div>
				{/snippet}
			</SvelteVirtualList>
		</div>

		{#if rows.length == 0}
			<p>Ei tuloksia</p>
		{/if}
	</main>
</div>
