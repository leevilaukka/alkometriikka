<script lang="ts">
	import StringInput from '$lib/components/inputs/StringInput.svelte';
	import NumberInput from '$lib/components/inputs/NumberInput.svelte';
	import { generateImageUrl } from '$lib/utils/image.js';
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import { twMerge } from 'tailwind-merge';
	import type { ColumnNames, DatasetRow, PriceListItem } from '$lib/types';
	import {
		shownFilters,
		filterRenameMap,
		filterToUnitMarker,
		shownColumnsToHighlight,
		defaultSortingColumn,
		AllColumns,
		shownSortingKeys,
		defaultSortingOrderMap
	} from '$lib/utils/constants';
	import { components } from '$lib/utils/styles';
	import {
		formatValue,
		headerToDisplayName,
		headerToUnitMarker,
		sortingOrderToString,
		valueToString
	} from '$lib/utils/helpers';
	import type { FullProperties } from 'xlsx';
	import Icon from '../widgets/Icon.svelte';
	import type { Kaljakori } from '$lib/alko';

	const { kaljakori }: { kaljakori: Kaljakori } = $props();

	console.log(kaljakori);

	let listRef: SvelteVirtualList<PriceListItem> | null = null;

	const filters = shownFilters;

	function initFilterValues() {
		return [...shownFilters, AllColumns.BeerType].reduce<{ [key: string]: any }>((obj, filter) => {
			if (kaljakori.getFilterType(filter) == 'number')
				obj[filter] = kaljakori.getMinAndMaxValues(filter);
			else if (kaljakori.getFilterType(filter) == 'string') obj[filter] = [];
			else if (kaljakori.getFilterType(filter) == 'any') obj[filter] = [];
			return obj;
		}, {});
	}

	let filterValues = $state(initFilterValues());

	let selectedHighlight = $state(defaultSortingColumn);

	let selectedSortingColumn = $state(defaultSortingColumn);
	let asc: boolean = $derived(
		defaultSortingOrderMap[selectedSortingColumn as keyof typeof defaultSortingOrderMap] || false
	);

	let filtersElement: HTMLDialogElement;
	let isMobile = $state(window.matchMedia('(width <= 48rem)').matches);
	let showFilters = $derived(!isMobile);

	$effect(() => {
		if (filtersElement.open) filtersElement.close();
		if (isMobile) return;
		filtersElement.show();
	});

	$effect(() => {
		if (
			filterValues[AllColumns.Type]?.length !== 1 ||
			filterValues[AllColumns.Type]?.[0] !== 'Oluet'
		) {
			filterValues[AllColumns.BeerType] = [];
		}
	});

	function toggleFilterElement() {
		if (!filtersElement) return;
		if (filtersElement.open) filtersElement.close();
		else if (isMobile) filtersElement.showModal();
		else filtersElement.show();
	}

	let rows = $derived.by(() => {
		let filterValuesCopy = { ...filterValues };
		Object.keys(filterValuesCopy as Record<string, any>).forEach((key) => {
			if (
				Array.isArray(filterValuesCopy[key]) &&
				kaljakori.getFilterType(key as ColumnNames) !== 'number'
			)
				filterValuesCopy[key] = new Set(filterValuesCopy[key]);
		});
		let temp = kaljakori.filter(filterValuesCopy);
		if (!!selectedSortingColumn)
			temp = temp.sort((a, b) => (a[selectedSortingColumn] > b[selectedSortingColumn] ? 1 : -1));
		if (!asc) temp = temp.reverse();
		return temp;
	});

	window.addEventListener('resize', () => {
		isMobile = window.matchMedia('(width <= 48rem)').matches;
	});
</script>

<div class="relative grid h-full grid-cols-[auto_1fr]">
	<aside
		class="flex h-full flex-col overflow-x-hidden overflow-y-auto md:w-84 md:border-r border-gray-300 z-10"
	>
		<dialog
			bind:this={filtersElement}
			class={twMerge(
				'relative m-auto hidden h-full w-full flex-col gap-4 rounded-lg border bg-gray-50 border-gray-200 p-4 backdrop:backdrop-blur-sm open:flex md:relative md:rounded-none md:border-0 md:border-r'
			)}
			onclose={() => (showFilters = false)}
		>
			{#each filters as filter}
				{@const possibleValues = kaljakori.getFilterValues(filter)}
				{@const type = kaljakori.getFilterType(filter)}
				<div class="flex w-full flex-col text-sm">
					{#if type === 'number'}
						{@const [min, max] = kaljakori.getMinAndMaxValues(filter) as number[]}
						<NumberInput label={filter} bind:value={filterValues[filter]} {min} {max} step={0.01} />
					{:else}
						<StringInput label={filter} options={possibleValues} bind:value={filterValues[filter]} name={filter} />
						{#if filter === AllColumns.Type && [AllColumns.Type]?.length === 1 && filterValues[AllColumns.Type]?.[0] === 'Oluet'}
							<StringInput
								label={filterRenameMap[AllColumns.BeerType as keyof typeof filterRenameMap] ?? AllColumns.BeerType}
								options={kaljakori.getFilterValues(AllColumns.BeerType)}
								bind:value={filterValues[AllColumns.BeerType]}
								name={AllColumns.BeerType}
							/>
						{/if}
					{/if}
				</div>
			{/each}
			<div
				class="sticky bottom-0 mt-auto flex w-full backdrop:backdrop-blur-sm flex-col gap-2 md:border-0 md:p-0"
			>
				<button
					onclick={() => {
						filterValues = initFilterValues();
						listRef?.scroll({ index: 0 });
					}}
					class={twMerge(components.button({ type: 'negative' }), 'w-full', 'mt-auto')}
				>
					<Icon name={'x_circle'} />
					<span>Tyhjennä suodattimet</span>
				</button>
				{#if isMobile}
					<button
						onclick={() => {
							toggleFilterElement();
							showFilters = !showFilters;
						}}
						class={twMerge(components.button(), 'w-full')}
					>
						<span>Sulje suodattimet</span>
					</button>
				{/if}
			</div>
		</dialog>
	</aside>
	<main class="mx-auto flex h-full w-full flex-col gap-3 bg-gray-100 p-4 md:gap-4 md:p-6">
		<div class="flex w-full flex-col items-start gap-4">
			<div class={twMerge('flex flex-row flex-wrap items-end gap-2')}>
				<div class="flex flex-col">
					<label for={'sortingColumn'} class="text-sm">
						{'Järjestys'}
					</label>
					<div class="flex flex-row flex-nowrap items-center">
						<select
							name="sortingColumn"
							id="sortingColumn"
							bind:value={selectedSortingColumn}
							class={twMerge(components.input(), 'rounded-none rounded-s pe-8')}
						>
							{#each shownSortingKeys as filter}
								<option value={filter}>{headerToDisplayName(filter)}</option>
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
								<span>{sortingOrderToString(asc, selectedSortingColumn)}</span>
								<Icon name={asc ? 'arrow_up' : 'arrow_down'} />
							</button>
						{/if}
					</div>
				</div>
				<div class="flex flex-col">
					<label for={'selectedHighlight'} class="text-sm">
						{'Korostus'}
					</label>
					<select
						name="selectedHighlight"
						id="selectedHighlight"
						bind:value={selectedHighlight}
						class={twMerge(components.input(), 'pe-8')}
					>
						{#each shownColumnsToHighlight as filter}
							<option value={filter}>{headerToDisplayName(filter)}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>
		<div class="flex flex-row flex-wrap justify-between gap-2">
			<p>Tulosten määrä: {rows.length}</p>
			<button
				onclick={() => {
					listRef?.scroll({ index: 0, smoothScroll: false });
				}}
				class={twMerge(components.button())}
			>
				<Icon name={'arrow_up'} />
				<span>Hyppää alkuun</span>
			</button>
		</div>
		<div class="flex flex-auto flex-col">
			<SvelteVirtualList
				items={rows}
				bufferSize={25}
				bind:this={listRef}
				itemsClass={'flex flex-col gap-3'}
			>
				{#snippet renderItem(item, idx: number)}
					{@const [_, max] = kaljakori.getMinAndMaxValues(selectedHighlight) as number[]}
					{@const multiplier = Number(item[selectedHighlight]) / max}
					{@const ratings = ['Matala', 'Kohtalainen', 'Korkea']}
					{@const rating = ratings[Number(((ratings.length - 1) * multiplier).toFixed(0))]}
					<div
						class={twMerge('relative flex flex-col gap-3 rounded border border-gray-200 shadow overflow-clip bg-white')}
					>
						<div
							class={twMerge('flex flex-col flex-nowrap items-center gap-4 p-4 pb-0 md:flex-row')}
						>
							<div class="flex aspect-square w-32 max-w-[8rem]">
								<img
									src={generateImageUrl(item[AllColumns.Number], item[AllColumns.Name])}
									alt={item[AllColumns.Name]}
									class="block h-full w-full object-contain"
								/>
							</div>
							<div class="flex w-full flex-col gap-2">
								<div class="flex flex-row items-center gap-3">
									<span
										class="absolute top-0 left-0 rounded-br bg-gray-100 p-0.5 text-sm text-gray-500"
									>
										{'#' + (idx + 1)}
									</span>
									<a
										href={`/tuotteet/${item[AllColumns.Number]}`}
										class="hover:underline"
									>
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
										<p>{valueToString(item[AllColumns.Availability], AllColumns.Availability)}</p>
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
								<div class="flex flex-col gap-4 md:flex-row md:items-center">
									<div class="flex items-center gap-2">
										<p class="text-2xl font-bold drop-shadow-lg">
											{Number.parseFloat(item[AllColumns.Price] as string).toFixed(2)} €
										</p>
										<span class="text-sm text-gray-500">({item[AllColumns.PricePerLiter]} €/L)</span
										>
									</div>
									{#if !!item[AllColumns.New]}
										<p class="rounded bg-red-200 px-1.5 py-0.5 text-sm text-red-800">Uutuus</p>
									{/if}
									{#if item[AllColumns.SpecialGroup] === 'Luomu'}
										<p class="rounded bg-green-300 px-1.5 py-0.5 text-sm text-green-800">Luomu</p>
									{/if}
									{#if item[AllColumns.SpecialGroup] === 'Vegaaneille soveltuva tuote'}
										<p class="rounded bg-emerald-300 px-1.5 py-0.5 text-sm text-emerald-800">
											Vegaani
										</p>
									{/if}
									{#if item[AllColumns.AlcoholPercentage] === 0}
										<p class="rounded bg-blue-300 px-1.5 py-0.5 text-sm text-blue-800">
											Alkoholiton
										</p>
									{/if}
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
								class="relative block h-4 w-full rounded-b bg-gradient-to-r from-red-500 via-amber-500 to-green-500"
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
		{#if isMobile}
			<button
				onclick={() => {
					toggleFilterElement();
					showFilters = !showFilters;
				}}
				class={twMerge(components.button(), 'w-full')}
			>
				<span>{showFilters ? 'Piilota suodattimet' : 'Näytä suodattimet'}</span>
				<Icon name={'filter'} />
			</button>
		{/if}
		{#if rows.length == 0}
			<p>Ei tuloksia</p>
		{/if}
	</main>
</div>
