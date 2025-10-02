<script lang="ts">
	import type { Kaljakori } from '$lib/alko';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import { AllColumns, filterRenameMap, shownFilters, subCategoryMap } from '$lib/utils/constants';
	import NumberInput from '../inputs/NumberInput.svelte';
	import StringInput from '../inputs/StringInput.svelte';
	import Icon from './Icon.svelte';
	import { isMobile } from '$lib/global.svelte';
	import { initFilterValues } from '$lib/utils/filters';
	import { filterValuesFromSearchParameters, searchParametersFromFilterValues } from '$lib/utils/filters';
	import { goto } from '$app/navigation';
	import { mergeFilterParameters } from '$lib/utils/helpers';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import type { ColumnNames } from '$lib/types';

	let {
		kaljakori,
		filterValues = $bindable(),
		useURLParams = true,
	}: {
		kaljakori: Kaljakori;
		filterValues: Record<ColumnNames, any[]>; // TODO: types?
		useURLParams?: boolean,
	} = $props();

	const filters = shownFilters;

	export function toggleFilterElement() {
		if (!filtersElement) return;
		if (filtersElement.open) filtersElement.close();
		else if ($isMobile) filtersElement.showModal();
		else filtersElement.show();
	}

	let filtersElement: HTMLDialogElement;
	let showFilters = $derived(!isMobile);

	$effect(() => {
		if (filtersElement.open) filtersElement.close();
		if ($isMobile) return;
		filtersElement.show();
	});

	$effect(() => {
		(Object.keys(filterValues) as ColumnNames[]).forEach((filter) => {
			if(Object.hasOwn(subCategoryMap, filter) && filterValues[filter].length > 1 && filterValues[subCategoryMap[filter as keyof typeof subCategoryMap]].length) filterValues[subCategoryMap[filter as keyof typeof subCategoryMap]] = []
		})
	});

	$effect(() => {
		if(!useURLParams) return
		const searchParams = searchParametersFromFilterValues(filterValues, kaljakori)
		const url = untrack(() => page.url)
		goto(`${url.pathname}?${mergeFilterParameters(url.searchParams, searchParams, filterValues).toString()}`, { replaceState: true })
	})
</script>

<dialog
	bind:this={filtersElement}
	class={twMerge(
		'relative m-auto hidden h-full w-full flex-col gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 backdrop:backdrop-blur-sm open:flex md:relative md:rounded-none md:border-0 md:border-r'
	)}
	onclose={() => (showFilters = false)}
>
	{#each filters as filter}
		{@const possibleValues = kaljakori.getFilterValues(filter)}
		{@const type = kaljakori.getFilterType(filter)}
		{#if possibleValues.length > 1 || (filter === "Uutuus" && possibleValues.length === 1)}
			<div class="flex w-full flex-col text-sm gap-2">
					{#if type === 'number'}
						{@const [min, max] = kaljakori.getMinAndMaxValues(filter) as number[]}
						<NumberInput label={filter} bind:value={filterValues[filter]} {min} {max} step={0.01} />
					{:else}
						<StringInput
							label={filter}
							options={possibleValues}
							bind:value={filterValues[filter]}
							name={filter}
						/>
					{/if}
					{#if Object.hasOwn(subCategoryMap, filter) && filterValues[filter].length === 1}
						{@const subFilter = subCategoryMap[filter as keyof typeof subCategoryMap]}
						{@const subFilterValues = kaljakori.getSubFilterValues(filter, filterValues[filter][0])}
						{#if subFilterValues.length}
							<StringInput
								label={filterRenameMap[subFilter as keyof typeof filterRenameMap] ?? subFilter}
								options={subFilterValues}
								bind:value={filterValues[subFilter]}
								name={subFilter}
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
	