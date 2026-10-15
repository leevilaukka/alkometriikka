<script lang="ts">
	import { productName } from '$lib/i18n/values';
	import { resolve } from '$app/paths';
	import { compareProductIds } from '$lib/global.svelte';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { components } from '$lib/utils/ui/styles';
	import {
		clearCompare,
		compareURL,
		removeFromCompare,
		MAX_COMPARE_PRODUCTS
	} from '$lib/utils/user/compare';
	import { goto } from '$app/navigation';
	import { twMerge } from 'tailwind-merge';
	import type { Kaljakori } from '$lib/alko';
	import type { PriceListItem } from '$lib/types';
	import Icon from './Icon.svelte';
	import ProductImage from './ProductImage.svelte';
	import { m } from '$lib/i18n';

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
				<div
					class="relative flex shrink-0 items-center gap-2 rounded border border-primary bg-secondary py-1 ps-1 pe-2"
				>
					<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white p-0.5">
						<ProductImage number={product[AllColumns.Number]} name={productName(product)} />
					</div>
					<span class="max-w-[12ch] truncate text-sm">{productName(product)}</span>
					<button
						aria-label={m.compare_remove_product({ name: productName(product) })}
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
				{m.compare_selected_of({ selected: products.length, total: MAX_COMPARE_PRODUCTS })}
			</span>
			<button
				onclick={() => clearCompare()}
				class={twMerge(components.button({ type: 'negative' }))}
			>
				<Icon name="trash" />
				<span class="hidden sm:inline">{m.settings_clear_button()}</span>
			</button>
			<button
				onclick={() => goto(resolve(compareURL(compareProductIds)))}
				class={twMerge(components.button({ type: 'positive' }))}
			>
				<span>{m.compare_button()}</span>
				<Icon name="arrow_right_stroke" />
			</button>
		</div>
	</div>
{/if}
