<script lang="ts">
	import SimilarProducts from '$lib/components/views/SimilarProducts.svelte';
	import { AllColumns, subCategoryMap } from '$lib/utils/constants.js';
	import type { ColumnNames } from '$lib/types.js';
	import { twMerge } from 'tailwind-merge';
	import { headerToDisplayName, valueToString } from '$lib/utils/helpers.js';
	import StringInput from '$lib/components/inputs/StringInput.svelte';

	let { data } = $props(); 

	const restrictionFields = new Set([
		AllColumns.Type,
		AllColumns.SubType,
		AllColumns.AlcoholPercentage,
		AllColumns.Price,
		AllColumns.BottleSize,
		AllColumns.Sugar,
		AllColumns.PackagingType,
		AllColumns.Description
	])

	let customProduct = $state({} as Record<ColumnNames, any>);

	$inspect(customProduct)
</script>

{#await data.alko}
	<div class="grid h-full w-full place-content-center">
		<div class="flex flex-col items-center gap-3">
			<span
				class="block h-16 w-16 animate-spin rounded-full border-[0.5rem] border-red-600 border-b-transparent"
			></span>
			<p>Ladataan...</p>
		</div>
	</div>
{:then alko}
	<div class="flex-auto grid grid-cols-[auto_1fr]">
		<aside
			class="z-10 flex h-full flex-col max-h-full overflow-hidden border-gray-300 md:w-84 md:border-r p-4 gap-4"
		>
			{#each restrictionFields.values() as field}
				{#if !Object.values(subCategoryMap).includes(field as any)}
					{@const fieldType = alko.kaljakori.getFilterType(field)}
					<div class="flex flex-col w-full gap-2">
					{#if fieldType === "string"}
						{@const possibleValues = alko.kaljakori.getFilterValues(field)}
						<StringInput 
							options={possibleValues as string[]}
							onchange={(value: any[]) => {
								customProduct[field] = value[0]
							}}
							label={headerToDisplayName(field)}
							multiple={false}
						/>
						{#if Object.hasOwn(subCategoryMap, field)}
							{@const subFilter = subCategoryMap[field as keyof typeof subCategoryMap]}
							{#if customProduct[field]}
								{@const subFilterValues = alko.kaljakori.getSubFilterValues(field, customProduct[field])}
								{#if subFilterValues.length > 1}
									<StringInput
										defaultValue={[]}
										label={headerToDisplayName(subFilter)}
										options={subFilterValues}
										onchange={(value: any[]) => {
											customProduct[subFilter] = value[0]
										}}
										multiple={false}
									/>
								{/if}
							{/if}
						{/if}
					{:else if fieldType === "object"}
						{@const possibleValues = alko.kaljakori.getFilterValues(field)}
						<StringInput 
							options={possibleValues as string[]}
							onchange={(value: any[]) => {
								customProduct[field] = new Set(value)
							}}
							label={headerToDisplayName(field)}
						/>
					{:else if fieldType === "number"}
						{@const possibleValues = alko.kaljakori.getFilterValues(field)}
						<label class="flex flex-col gap-2">{valueToString(customProduct[field] ?? possibleValues[0], field)}
							<input type="range" min={0} max={possibleValues.length-1} step={1} value={0} oninput={(event: Event) => {
								customProduct[field] = possibleValues[(event.target as HTMLInputElement).value as unknown as number];
							}} />
						</label>
					{/if}
					</div>
				{/if}
			{/each}
		</aside>
		<div class={twMerge('flex w-full flex-auto flex-col flex-nowrap')}>
			<SimilarProducts product={customProduct} kaljakori={alko.kaljakori} show={{ source: false }} limit={20} />
		</div>	
	</div>
{/await}