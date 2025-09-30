<script lang="ts">
	import type { Kaljakori } from '$lib/alko';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import { AllColumns, filterRenameMap, shownFilters } from '$lib/utils/constants';
	import NumberInput from '../inputs/NumberInput.svelte';
	import StringInput from '../inputs/StringInput.svelte';
	import Icon from './Icon.svelte';
	import { isMobile } from '$lib/global.svelte';

	let {
		kaljakori,
		filterValues = $bindable(initFilterValues()),
	}: {
		kaljakori: Kaljakori;
		filterValues: any;
	} = $props();

	function initFilterValues() {
		return [...shownFilters, AllColumns.BeerType].reduce<{ [key: string]: any }>((obj, filter) => {
			if (kaljakori.getFilterType(filter) == 'number')
				obj[filter] = kaljakori.getMinAndMaxValues(filter);
			else if (kaljakori.getFilterType(filter) == 'string') obj[filter] = [];
			else if (kaljakori.getFilterType(filter) == 'any') obj[filter] = [];
			return obj;
		}, {});
	}

	if(Object.keys(filterValues).length == 0) filterValues = initFilterValues()

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
		if (
			filterValues[AllColumns.Type]?.length !== 1 ||
			filterValues[AllColumns.Type]?.[0] !== 'Oluet'
		) {
			filterValues[AllColumns.BeerType] = [];
		}
	});

	$inspect("filterValues", filterValues)
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
						{#if filter === AllColumns.Type && [AllColumns.Type]?.length === 1 && filterValues[AllColumns.Type]?.[0] === 'Oluet'}
							<StringInput
								label={filterRenameMap[AllColumns.BeerType as keyof typeof filterRenameMap] ??
									AllColumns.BeerType}
								options={kaljakori.getFilterValues(AllColumns.BeerType)}
								bind:value={filterValues[AllColumns.BeerType]}
								name={AllColumns.BeerType}
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
				filterValues = initFilterValues();
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
	