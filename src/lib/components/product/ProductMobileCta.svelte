<script lang="ts">
	import { AllColumns } from '$lib/utils/constants/columns';
	import { formatValue } from '$lib/utils/format/format';
	import type { PriceListItem } from '$lib/types';
	import { isStaleArrival } from '$lib/utils/catalog/status';
	import { components } from '$lib/utils/ui/styles';
	import Icon from '../widgets/Icon.svelte';
	import AddToListButton from '../widgets/AddToListButton.svelte';
	import CompareButton from '../widgets/CompareButton.svelte';
	import { twMerge } from 'tailwind-merge';
	import BottomBar from '../widgets/BottomBar.svelte';

	const { product, class: _class = '' }: { product: PriceListItem; class?: string } = $props();
</script>

<BottomBar class={_class}>
	<div class="flex shrink-0 flex-col">
		<strong class="text-lg leading-tight"
			>{formatValue(product[AllColumns.Price], AllColumns.Price)}</strong
		>
		<span class="text-xs text-secondary">
			{formatValue(product[AllColumns.BottleSize], AllColumns.BottleSize)} · {formatValue(
				product[AllColumns.PricePerLiter],
				AllColumns.PricePerLiter
			)}
		</span>
	</div>
	{#if !product[AllColumns.RemovedFromSelection] && !isStaleArrival(product)}
		<a
			href={`https://www.alko.fi/tuotteet/${product[AllColumns.Number]}`}
			target="_blank"
			rel="noopener noreferrer"
			referrerpolicy="no-referrer"
			class={twMerge(components.button({ size: 'lg' }), 'ml-auto aspect-square h-11 shrink-0')}
			aria-label="Alkon tuotesivu"
		>
			<Icon name="link_external" />
		</a>
	{:else}
		<span class="ml-auto"></span>
	{/if}
	<CompareButton
		productNumber={product[AllColumns.Number]}
		size="lg"
		iconPosition="end"
		compact
		class="aspect-square h-11 shrink-0 sm:aspect-auto"
	/>
	<AddToListButton
		productNumber={product[AllColumns.Number]}
		size="lg"
		compact
		class="h-11 w-20 sm:w-full"
	/>
</BottomBar>
