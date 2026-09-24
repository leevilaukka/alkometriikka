<script lang="ts">
	import { compareProductIds } from '$lib/global.svelte';
	import { AllColumns } from '$lib/utils/constants';
	import { components } from '$lib/utils/styles';
	import { clearCompare, compareURL, removeFromCompare, MAX_COMPARE_PRODUCTS } from '$lib/utils/compare';
	import { goto } from '$app/navigation';
	import { twMerge } from 'tailwind-merge';
	import type { Kaljakori } from '$lib/alko';
	import type { PriceListItem } from '$lib/types';
	import Icon from './Icon.svelte';
	import ProductImage from './ProductImage.svelte';

	const { kaljakori }: { kaljakori: Kaljakori } = $props();

	const products = $derived(
		compareProductIds
			.map((id) => kaljakori.findById(id))
			.filter((product): product is PriceListItem => Boolean(product))
	);
</script>

{#if products.length > 0}
	<div
		class="sticky bottom-0 z-20 flex w-full flex-col gap-2 border-t border-primary bg-primary p-3 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] md:flex-row md:items-center md:gap-4"
	>
		<div class="flex flex-1 flex-row flex-nowrap items-center gap-2 overflow-x-auto">
			{#each products as product (product[AllColumns.Number])}
				<div class="relative flex shrink-0 items-center gap-2 rounded border border-primary bg-secondary py-1 ps-1 pe-2">
					<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white p-0.5">
						<ProductImage number={product[AllColumns.Number]} name={product[AllColumns.Name]} />
					</div>
					<span class="max-w-[12ch] truncate text-sm">{product[AllColumns.Name]}</span>
					<button
						aria-label={`Poista ${product[AllColumns.Name]} vertailusta`}
						onclick={() => removeFromCompare(product[AllColumns.Number])}
						class="grid h-5 w-5 shrink-0 place-content-center rounded-full text-secondary hover:bg-primary"
					>
						<Icon name="x" class="text-xs" />
					</button>
				</div>
			{/each}
		</div>
		<div class="flex shrink-0 flex-row flex-nowrap items-center justify-end gap-2">
			<span class="hidden text-sm text-secondary md:block">
				{products.length}/{MAX_COMPARE_PRODUCTS} valittu
			</span>
			<button onclick={() => clearCompare()} class={twMerge(components.button({ type: 'negative' }))}>
				<Icon name="trash" />
				<span class="hidden sm:inline">Tyhjennä</span>
			</button>
			<button
				onclick={() => goto(compareURL(compareProductIds))}
				class={twMerge(components.button({ type: 'positive' }))}
			>
				<span>Vertaile</span>
				<Icon name="arrow_right_stroke" />
			</button>
		</div>
	</div>
{/if}
