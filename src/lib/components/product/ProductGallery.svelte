<script lang="ts">
	import { productName } from '$lib/i18n/values';
	import { AllColumns } from '$lib/utils/constants/columns';
	import type { PriceListItem } from '$lib/types';
	import type { SaleInfo } from '$lib/utils/catalog/sales';
	import ProductImage from '../widgets/ProductImage.svelte';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';
	import { locale } from '$lib/i18n';

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
		name={productName(product)}
		transform="medium"
		alt={productName(product)}
	/>
	{#if sale}
		<span
			class="absolute top-4 left-4 flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-sm font-bold text-white"
		>
			<Icon name="price_tag" />
			<span>-{sale.discountPercent}{locale === 'en' ? '%' : ' %'}</span>
		</span>
	{/if}
</div>
