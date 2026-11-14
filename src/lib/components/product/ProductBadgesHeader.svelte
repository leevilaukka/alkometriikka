<script lang="ts">
	import { resolve } from '$app/paths';
	import { AllColumns } from '$lib/utils/constants/columns';
	import type { PriceListItem } from '$lib/types';
	import type { SaleInfo } from '$lib/utils/catalog/sales';
	import BadgeList from '../widgets/BadgeList.svelte';
	import { twMerge } from 'tailwind-merge';

	const {
		product,
		class: _class = ''
	}: { product: PriceListItem; sale: SaleInfo | null; class?: string } = $props();

	// The words are capitalized one by one, as tags; as a line only its first one is
	const description = $derived(
		[...(product[AllColumns.Description] ?? [])]
			.map((word, index) => (index ? word.toLowerCase() : word))
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
			product[AllColumns.Country],
			product[AllColumns.SubType] ? product[AllColumns.SubType] : product[AllColumns.Type],
			product[AllColumns.RemovedFromSelection]
				? 'Poistunut valikoimasta'
				: product[AllColumns.Availability]
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
			{product[AllColumns.Name]}
		</h1>
		<p class="text-secondary">
			{#if product[AllColumns.Manufacturer]}
				<a
					href={manufacturerHref}
					class="hover:underline"
					title={`Kaikki valmistajan ${product[AllColumns.Manufacturer]} tuotteet`}
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
