<script lang="ts">
	import { resolve } from '$app/paths';
	import { AllColumns } from '$lib/utils/constants/columns';
	import type { PriceListItem } from '$lib/types';
	import type { SaleInfo } from '$lib/utils/catalog/sales';
	import BadgeList from '../widgets/BadgeList.svelte';
	import { twMerge } from 'tailwind-merge';
	import { m } from '$lib/i18n';
	import { productName, translateValue } from '$lib/i18n/values';

	const {
		product,
		class: _class = ''
	}: { product: PriceListItem; sale: SaleInfo | null; class?: string } = $props();

	const description = $derived(
		[...(product[AllColumns.Description] ?? [])]
			.map((word) => translateValue(word, AllColumns.Description))
			.join(', ')
	);

	// The main list narrowed to the same producer's products
	const manufacturerHref = $derived.by(() => {
		const params = new URLSearchParams();
		params.set(AllColumns.Manufacturer, product[AllColumns.Manufacturer]);
		return resolve(`/?${params}`);
	});

	const details = $derived(
		[
			translateValue(product[AllColumns.Country], AllColumns.Country),
			product[AllColumns.SubType]
				? translateValue(product[AllColumns.SubType], AllColumns.SubType)
				: translateValue(product[AllColumns.Type], AllColumns.Type),
			product[AllColumns.RemovedFromSelection]
				? m.column_removed_from_selection()
				: translateValue(product[AllColumns.Availability], AllColumns.Availability)
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<div class={twMerge('flex flex-col gap-4', _class)}>
	<div class="flex flex-col gap-1">
		<h1
			class="text-wrap-pretty text-3xl leading-tight font-bold lg:text-4xl"
			data-product={product[AllColumns.Name]}
		>
			{productName(product)}
		</h1>
		<p class="text-secondary">
			{#if product[AllColumns.Manufacturer]}
				<a
					href={manufacturerHref}
					class="hover:underline"
					title={m.product_all_by_manufacturer({ manufacturer: product[AllColumns.Manufacturer] })}
					>{product[AllColumns.Manufacturer]}</a
				>{#if details}{' · '}{/if}
			{/if}{details}
		</p>
	</div>
	<div class="flex flex-wrap gap-2">
		<BadgeList item={product} isProductPage={true} />
	</div>
	{#if description}
		<p class="text-wrap-pretty">{description}</p>
	{/if}
</div>
