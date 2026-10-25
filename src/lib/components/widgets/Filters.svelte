<script lang="ts">
	import type { Kaljakori } from '$lib/alko';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/ui/styles';
	import { ContextKeys } from '$lib/utils/constants/app';
	import { filterOptionGroupers, shownFilters as filters } from '$lib/utils/constants/display';
	import { AllColumns } from '$lib/utils/constants/columns';
	import NumberInput from '../inputs/NumberInput.svelte';
	import StringInput from '../inputs/StringInput.svelte';
	import Icon from './Icon.svelte';
	import { isMobile } from '$lib/global.svelte';
	import {
		COMMA_SEPARATED_FILTERS,
		getNarrowedFilterValues,
		getNestedSubFilter,
		getShownParentFilter,
		initFilterValues,
		joinFilterParams,
		searchParametersFromFilterValues
	} from '$lib/utils/catalog/filters';
	import type { ColumnNames, FilterValues } from '$lib/types';
	import { getContext, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import type { SearchParamsManager } from '$lib/utils/app/url';
	import { headerToDisplayName } from '$lib/utils/format/labels';
	import RecursiveFilter from '../inputs/RecursiveFilter.svelte';
	import { trackFilterUsage } from '$lib/utils/app/filterAnalytics.svelte';
	import { m } from '$lib/i18n';

	let {
		kaljakori,
		filterValues = $bindable(),
		activeFilters = $bindable([]),
		showRemoved = $bindable(false),
		useURLParams = true,
		resultCount
	}: {
		kaljakori: Kaljakori;
		filterValues: FilterValues;
		activeFilters: ColumnNames[];
		showRemoved?: boolean;
		useURLParams?: boolean;
		/** Number of results the filters give, sent with the filter usage analytics */
		resultCount?: number;
	} = $props();

	trackFilterUsage(
		untrack(() => (useURLParams ? 'products' : 'list')),
		() => searchParametersFromFilterValues(filterValues, kaljakori, showRemoved),
		() => resultCount
	);

	let searchParamsManager = getContext<SearchParamsManager>(ContextKeys.SearchParamsManager);
	let filtersElement: HTMLDialogElement;
	let showFilters = $state(get(isMobile));
	let hasRemovedProducts = $derived(
		kaljakori.data.some((item) => item[AllColumns.RemovedFromSelection] === true)
	);
	let filterActiveState = $state(
		filters.reduce(
			(acc, filter) => {
				acc[filter] = false;
				return acc;
			},
			{} as Record<ColumnNames, boolean>
		)
	);

	let pillFilters = $derived.by(() =>
		filters.filter((filter) => {
			const type = kaljakori.getFilterType(filter);
			return type === 'string' && kaljakori.getFilterValues(filter, showRemoved).length === 1;
		})
	);

	export function toggleFilterElement() {
		if (!filtersElement) return;
		if (filtersElement.open) filtersElement.close();
		else if ($isMobile) filtersElement.showModal();
		else filtersElement.show();
	}

	$effect(() => {
		activeFilters = Object.entries(filterActiveState)
			.filter(([_, value]) => {
				return value;
			})
			.map(([filter]) => filter) as ColumnNames[];
	});

	$effect(() => {
		if (filtersElement.open) filtersElement.close();
		if ($isMobile) return;
		filtersElement.show();
	});

	$effect(() => {
		// Reset sub filters when parent filter is changed
		filterValues &&
			(Object.keys(filterValues) as ColumnNames[]).forEach((filter) => {
				const child = getNestedSubFilter(filter);
				if (child && filterValues[filter].length !== 1 && filterValues[child]?.length) {
					filterValues[child] = [];
				}
			});
	});

	$effect(() => {
		// Drop selections that no longer match the selections of a shown parent filter
		filters.forEach((filter) => {
			const value = filterValues[filter];
			if (!getShownParentFilter(filter) || !Array.isArray(value) || !value.length) return;
			const allowed = new Set(
				getNarrowedFilterValues(filter, filterValues, kaljakori, showRemoved)
			);
			if (value.some((v) => !allowed.has(v)))
				filterValues[filter] = value.filter((v) => allowed.has(v));
		});
	});

	/** Each number range's default, the full range of its values */
	function rangeDefaults(removed: boolean) {
		const defaults: Partial<Record<ColumnNames, [number, number]>> = {};
		for (const filter of Object.keys(filterValues) as ColumnNames[])
			if (kaljakori.getFilterType(filter) === 'number')
				defaults[filter] = kaljakori.getMinAndMaxValues(filter, removed);
		return defaults;
	}

	let previousShowRemoved = showRemoved;
	let previousProducts = untrack(() => kaljakori.data);
	let previousDefaults = untrack(() => rangeDefaults(showRemoved));
	$effect(() => {
		// Toggling "show removed", or removed products arriving after the rest, changes the
		// min/max defaults for number ranges. Re-sync any range that is still at its previous
		// default to the new default so this doesn't mark filters as modified / leak URL params.
		const currentShowRemoved = showRemoved;
		const products = kaljakori.data;
		if (currentShowRemoved === previousShowRemoved && products === previousProducts) return;
		untrack(() => {
			(Object.keys(filterValues) as ColumnNames[]).forEach((filter) => {
				const value = filterValues[filter];
				// Drop selections that only exist on removed products, as they'd match nothing
				if (
					kaljakori.getFilterType(filter) === 'string' &&
					!currentShowRemoved &&
					currentShowRemoved !== previousShowRemoved &&
					Array.isArray(value) &&
					value.length
				) {
					const activeValues = new Set(kaljakori.getFilterValues(filter, false));
					if (value.some((v) => !activeValues.has(v)))
						filterValues[filter] = value.filter((v) => activeValues.has(v));
					return;
				}
				if (kaljakori.getFilterType(filter) !== 'number') return;
				if (!Array.isArray(value)) return;
				const oldDefault = previousDefaults[filter];
				if (oldDefault && value[0] === oldDefault[0] && value[1] === oldDefault[1])
					filterValues[filter] = kaljakori.getMinAndMaxValues(filter, currentShowRemoved);
			});
			previousShowRemoved = currentShowRemoved;
			previousProducts = products;
			previousDefaults = rangeDefaults(currentShowRemoved);
		});
	});

	$effect(() => {
		// Update URL parameters when filter values change
		if (!useURLParams) return;
		const filterValuesAsSearchParams = searchParametersFromFilterValues(
			filterValues,
			kaljakori,
			showRemoved
		);
		searchParamsManager
			.setParametersFromObject(
				COMMA_SEPARATED_FILTERS
					? joinFilterParams(filterValuesAsSearchParams)
					: filterValuesAsSearchParams
			)
			.update();
	});
</script>

<dialog
	bind:this={filtersElement}
	aria-label={m.filters_title()}
	class={twMerge(
		'relative m-auto hidden h-full w-full flex-col gap-4 overflow-x-hidden overflow-y-auto rounded-lg border border-primary bg-primary p-4 transition-transform backdrop:backdrop-blur-sm open:flex open:scale-100 md:relative md:rounded-none md:border-0 open:starting:scale-0 md:open:starting:scale-100'
	)}
	onclose={() => (showFilters = false)}
>
	{#each filters as filter}
		{@const possibleValues = getNarrowedFilterValues(filter, filterValues, kaljakori, showRemoved)}
		{@const type = kaljakori.getFilterType(filter)}
		{#if filter === AllColumns.StoreAvailability && !kaljakori.availabilityLoaded}
			<!-- availability.json loads after the products; hold the store filter's place until then -->
			<div class="flex w-full flex-col gap-2 text-sm" aria-busy="true">
				<span>{headerToDisplayName(filter)}</span>
				<button
					disabled
					class={twMerge(
						components.button(),
						'w-full cursor-wait justify-start gap-2 text-secondary'
					)}
				>
					<span
						class="block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-red-600 border-b-transparent"
						aria-hidden="true"
					></span>
					<span>{m.filters_loading_stores()}</span>
				</button>
			</div>
		{:else if !pillFilters.includes(filter) && possibleValues.length > 1}
			<div class="flex w-full flex-col gap-2 text-sm">
				{#if type === 'number'}
					{@const [min, max] = kaljakori.getMinAndMaxValues(filter, showRemoved)}
					<NumberInput
						defaultValue={[min, max]}
						label={filter}
						bind:value={filterValues[filter]}
						bind:modified={filterActiveState[filter]}
						{min}
						{max}
						step={0.01}
					/>
				{:else}
					<StringInput
						defaultValue={[]}
						label={headerToDisplayName(filter)}
						options={possibleValues}
						bind:value={filterValues[filter]}
						bind:modified={filterActiveState[filter]}
						name={filter}
						groupOptions={filterOptionGroupers[filter]}
					/>
				{/if}
				<RecursiveFilter {filter} bind:filterValues {kaljakori} {showRemoved} />
			</div>
		{/if}
	{/each}
	{#if pillFilters.length}
		<div class="flex w-full flex-row flex-wrap items-center gap-2">
			{#each pillFilters as filter}
				{@const possibleValues = kaljakori.getFilterValues(filter, showRemoved)}
				<StringInput
					defaultValue={[]}
					label={headerToDisplayName(filter)}
					options={possibleValues}
					bind:value={filterValues[filter]}
					bind:modified={filterActiveState[filter]}
					name={filter}
				/>
			{/each}
		</div>
	{/if}
	<div
		class="sticky bottom-0 mt-auto flex w-full flex-col gap-2 backdrop:backdrop-blur-sm md:border-0 md:p-0"
	>
		{#if hasRemovedProducts}
			<button
				onclick={() => (showRemoved = !showRemoved)}
				class={twMerge(components.button(), 'w-full')}
			>
				<Icon name={showRemoved ? 'eye' : 'eye_slash'} />
				<span>{showRemoved ? m.filters_hide_removed() : m.filters_show_removed()}</span>
			</button>
		{/if}
		<button
			onclick={() => {
				filterValues = initFilterValues(kaljakori, undefined, showRemoved);
			}}
			class={twMerge(components.button({ type: 'negative' }), 'w-full', 'mt-auto')}
		>
			<Icon name={'x_circle'} />
			<span>{m.filters_clear()}</span>
		</button>
		{#if $isMobile}
			<button
				onclick={() => {
					toggleFilterElement();
					showFilters = !showFilters;
				}}
				class={twMerge(components.button(), 'w-full')}
			>
				<span>{m.filters_close()}</span>
			</button>
		{/if}
	</div>
</dialog>
