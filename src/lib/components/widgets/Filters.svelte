<script lang="ts">
	import type { Kaljakori } from '$lib/alko';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import { ContextKeys, filterRenameMap, shownFilters as filters, subCategoryMap } from '$lib/utils/constants';
	import NumberInput from '../inputs/NumberInput.svelte';
	import StringInput from '../inputs/StringInput.svelte';
	import Icon from './Icon.svelte';
	import { isMobile } from '$lib/global.svelte';
	import { initFilterValues, searchParametersFromFilterValues } from '$lib/utils/filters';
	import type { ColumnNames, FilterValues } from '$lib/types';
	import { getContext } from 'svelte';
	import type { SearchParamsManager } from '$lib/utils/url';
	import { headerToDisplayName } from '$lib/utils/helpers';

	let {
		kaljakori,
		filterValues = $bindable(),
		activeFilters = $bindable([]),
		useURLParams = true,
	}: {
		kaljakori: Kaljakori;
		filterValues: FilterValues
		activeFilters: ColumnNames[],
		useURLParams?: boolean,
	} = $props();
	
	let searchParamsManager = getContext<SearchParamsManager>(ContextKeys.SearchParamsManager);
	let filtersElement: HTMLDialogElement;
	let showFilters = $derived(!isMobile);
	let filterActiveState = $state(filters.reduce((acc, filter) => {
		acc[filter] = false;
		return acc;
	}, {} as Record<ColumnNames, boolean>));

	export function toggleFilterElement() {
		if (!filtersElement) return;
		if (filtersElement.open) filtersElement.close();
		else if ($isMobile) filtersElement.showModal();
		else filtersElement.show();
	}
	
	$effect(() => {
		activeFilters = Object.entries(filterActiveState).filter(([_, value]) => { return value }).map(([filter]) => filter) as ColumnNames[];
	});

	$effect(() => {
		if (filtersElement.open) filtersElement.close();
		if ($isMobile) return;
		filtersElement.show();
	});

	$effect(() => {
		// Reset sub filters when parent filter is changed
		filterValues && (Object.keys(filterValues) as ColumnNames[]).forEach((filter) => {
			if(Object.hasOwn(subCategoryMap, filter) && filterValues[filter].length !== 1 && filterValues[subCategoryMap[filter as keyof typeof subCategoryMap]].length)  {
				filterValues[subCategoryMap[filter as keyof typeof subCategoryMap]] = []
			}
		})
	});

	$effect(() => {
		// Update URL parameters when filter values change
		if(!useURLParams) return
		const filterValuesAsSearchParams = searchParametersFromFilterValues(filterValues, kaljakori)
		searchParamsManager.setParametersFromObject(filterValuesAsSearchParams).update()
	})
</script>

<dialog
	bind:this={filtersElement}
	class={twMerge(
		'relative m-auto hidden h-full w-full flex-col gap-4 rounded-lg border border-gray-200 p-4 backdrop:backdrop-blur-sm open:flex md:relative md:rounded-none md:border-0 overflow-x-hidden overflow-y-auto'
	)}
	onclose={() => (showFilters = false)}
>
	{#each filters as filter}
		{@const possibleValues = kaljakori.getFilterValues(filter)}
		{@const type = kaljakori.getFilterType(filter)}
		{#if possibleValues.length > 1 || (filter === "Uutuus" && possibleValues.length === 1)}
			<div class="flex w-full flex-col text-sm gap-2">
				{#if type === 'number'}
					{@const [min, max] = kaljakori.getMinAndMaxValues(filter)}
					<NumberInput defaultValue={[min, max]} label={filter} bind:value={filterValues[filter]} bind:modified={filterActiveState[filter]} {min} {max} step={0.01} />
				{:else if type === "object"}
					<StringInput
						defaultValue={[]}
						label={headerToDisplayName(filter)}
						options={possibleValues as string[]}
						bind:value={filterValues[filter] as string[]}
						bind:modified={filterActiveState[filter]}
					/>
				{:else}
					<StringInput
						defaultValue={[]}
						label={headerToDisplayName(filter)}
						options={possibleValues as string[]}
						bind:value={filterValues[filter] as string[]}
						bind:modified={filterActiveState[filter]}
					/>
				{/if}
				{#if Object.hasOwn(subCategoryMap, filter) && filterValues[filter].length === 1}
					{@const subFilter = subCategoryMap[filter as keyof typeof subCategoryMap]}
					{@const subFilterValues = kaljakori.getSubFilterValues(filter, filterValues[filter][0])}
					{#if subFilterValues.length > 1}
						<StringInput
							defaultValue={[]}
							label={headerToDisplayName(subFilter)}
							options={subFilterValues}
							bind:value={filterValues[subFilter] as string[]}
						/>
					{/if}
				{/if}
			</div>
		{/if}
	{/each}
	<div
		class="sticky bottom-0 mt-auto flex w-full flex-col gap-2 backdrop:backdrop-blur-sm md:border-0 md:p-0"
	>
		<button
			onclick={() => {
				filterValues = initFilterValues(kaljakori);
			}}
			class={twMerge(components.button({ type: 'negative' }), 'w-full', 'mt-auto')}
		>
			<Icon name={'x_circle'} />
			<span>Tyhjennä suodattimet</span>
		</button>
		{#if $isMobile}
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
	