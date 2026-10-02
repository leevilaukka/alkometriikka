<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import type { PriceListItem } from '$lib/types';
	import type { SaleInfo } from '$lib/utils/sales';
	import ProductImage from '../widgets/ProductImage.svelte';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';

	const {
		product,
		sale,
		class: _class = ''
	}: { product: PriceListItem; sale: SaleInfo | null; class?: string } = $props();
</script>

<div
	class={twMerge(
		'relative flex aspect-square w-full shrink-0 rounded bg-white p-6 lg:w-[360px]',
		_class
	)}
>
	<ProductImage
		number={product[AllColumns.Number]}
		name={product[AllColumns.Name]}
		transform="medium"
		alt={product[AllColumns.Name]}
	/>
	{#if sale}
		<span
			class="absolute top-4 left-4 flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-sm font-bold text-white"
		>
			<Icon name="price_tag" />
			<span>-{sale.discountPercent} %</span>
		</span>
	{/if}
</div>
