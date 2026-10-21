<script lang="ts" module>
	import type { PriceListItem } from '$lib/types';

	export type ProductMiniRow = {
		product: PriceListItem;
		/** Second line under the name */
		detail: string;
		/** Right-hand value, e.g. a price or a change */
		aside?: string;
		asideClass?: string;
	};
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { twMerge } from 'tailwind-merge';
	import ProductImage from './ProductImage.svelte';

	/** Compact product rows with a thumbnail, for page sections that list a handful of products. */
	const { rows, class: _class = '' }: { rows: ProductMiniRow[]; class?: string } = $props();
</script>

<ul class={twMerge('rounded border border-primary bg-primary text-sm', _class)}>
	{#each rows as row (row.product[AllColumns.Number])}
		<li class="flex items-center gap-3 border-t border-primary px-3 py-2 first:border-t-0">
			<!-- White like the other product photo tiles, so the photos' white backgrounds don't show in dark mode -->
			<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-white p-0.5">
				<ProductImage
					number={row.product[AllColumns.Number]}
					name={row.product[AllColumns.Name]}
					alt=""
					class="h-full w-full object-contain"
				/>
			</div>
			<div class="flex min-w-0 flex-1 flex-col">
				<a
					href={resolve(`/tuotteet/${row.product[AllColumns.Number]}/`)}
					class="truncate font-semibold hover:underline"
					title={row.product[AllColumns.Name]}
				>
					{row.product[AllColumns.Name]}
				</a>
				<span class="truncate text-xs text-secondary">{row.detail}</span>
			</div>
			{#if row.aside}
				<span class={twMerge('shrink-0 font-bold', row.asideClass)}>{row.aside}</span>
			{/if}
		</li>
	{/each}
</ul>
