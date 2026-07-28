<script lang="ts">
    import RecursiveFilter from "./RecursiveFilter.svelte";
	import StringInput from "../inputs/StringInput.svelte";
	import { subCategoryMap } from "$lib/utils/constants";
	import { headerToDisplayName } from "$lib/utils/helpers";
	import type { FilterValues, ColumnNames } from "$lib/types";
	import type { Kaljakori } from "$lib/alko";

	let {
		filter,
		filterValues = $bindable(),
		kaljakori,
		showRemoved = true,
	}: {
		filter: ColumnNames;
		filterValues: FilterValues;
		kaljakori: Kaljakori;
		showRemoved?: boolean;
	} = $props();

	const child = $derived(subCategoryMap[filter as keyof typeof subCategoryMap]);
</script>

{#if child && filterValues[filter].length === 1}
	{@const options = kaljakori.getSubFilterValues(filter, filterValues, showRemoved)}

	{#if options.length > 1}
		<StringInput
			defaultValue={[]}
			label={headerToDisplayName(child)}
			{options}
			bind:value={filterValues[child]}
			name={child}
		/>

		<!-- Render the next level -->
		<RecursiveFilter
            bind:filterValues
            {kaljakori}
            {showRemoved}
            filter={child}
        />
	{/if}
{/if}