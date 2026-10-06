<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import type { PriceListItem } from '$lib/types';
	import type { SaleInfo } from '$lib/utils/sales';
	import BadgeList from '../widgets/BadgeList.svelte';
	import { twMerge } from 'tailwind-merge';

	const { product, class: _class = '' }: { product: PriceListItem; sale: SaleInfo | null; class?: string } =
		$props();

	const description = $derived([...(product[AllColumns.Description] ?? [])].join(', '));
</script>

<div class={twMerge('flex flex-col gap-4', _class)}>
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl leading-tight font-bold text-wrap-pretty lg:text-4xl" data-product={product[AllColumns.Name]}>
			{product[AllColumns.Name]}
		</h1>
		<p class="text-secondary">
			{[
				product[AllColumns.Manufacturer],
				product[AllColumns.Country],
				product[AllColumns.SubType] ? product[AllColumns.SubType] : product[AllColumns.Type],
				product[AllColumns.RemovedFromSelection] ? 'Poistunut valikoimasta' : product[AllColumns.Availability]
			]
				.filter(Boolean)
				.join(' · ')}
		</p>
	</div>
	<div class="flex flex-wrap gap-2">
		<BadgeList item={product} isProductPage={true} />
	</div>
	{#if description}
		<p class="text-wrap-pretty">{description}</p>
	{/if}
</div>
