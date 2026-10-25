<script lang="ts">
	import { m } from '$lib/i18n';
	import { loadStoreStock } from '$lib/alko/stock';
	import type { PriceListItem } from '$lib/types';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { formatValue } from '$lib/utils/format/format';
	import { formatPriceChangeDate } from '$lib/utils/stats/priceChanges';
	import { bestValueByType, storeArrivals, storeSales } from '$lib/utils/catalog/storeHighlights';
	import type { StoreStockFile } from '$lib/utils/catalog/stock';
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import ProductMiniList, { type ProductMiniRow } from '../widgets/ProductMiniList.svelte';

	/** `products` are the active products the store stocks. */
	const { storeId, products }: { storeId: string; products: PriceListItem[] } = $props();

	const COLLAPSED_ROWS = 5;

	let stock = $state<StoreStockFile | null>(null);
	$effect(() => {
		const id = storeId;
		stock = null;
		loadStoreStock(id).then((file) => {
			if (id === storeId) stock = file;
		});
	});

	function detail(product: PriceListItem) {
		return [
			product[AllColumns.SubType],
			formatValue(product[AllColumns.BottleSize], AllColumns.BottleSize)
		]
			.filter(Boolean)
			.join(' · ');
	}

	const price = (product: PriceListItem) =>
		formatValue(product[AllColumns.Price], AllColumns.Price) as string;

	const arrivals = $derived<ProductMiniRow[]>(
		stock
			? storeArrivals(stock, products).map(({ product, date }) => ({
					product,
					detail: `${formatPriceChangeDate(date)} · ${detail(product)}`,
					aside: price(product)
				}))
			: []
	);

	const newProducts = $derived<ProductMiniRow[]>(
		products
			.filter((product) => product[AllColumns.New])
			.map((product) => ({ product, detail: detail(product), aside: price(product) }))
	);

	const sales = $derived<ProductMiniRow[]>(
		storeSales(products).map(({ product, sale }) => ({
			product,
			detail: `${formatValue(sale.normalPrice, AllColumns.Price)} → ${formatValue(sale.salePrice, AllColumns.Price)}`,
			aside: `−${sale.discountPercent} %`,
			asideClass: 'text-green-700 dark:text-green-400'
		}))
	);

	const bestValue = $derived<ProductMiniRow[]>(
		bestValueByType(products).map((product) => ({
			product,
			detail: `${product[AllColumns.Type]} · ${price(product)}`,
			aside: formatValue(
				product[AllColumns.AlcoholGramsPerEuro],
				AllColumns.AlcoholGramsPerEuro
			) as string
		}))
	);

	let expanded = $state<Record<string, boolean>>({});
</script>

{#snippet section(key: string, title: string, hint: string, rows: ProductMiniRow[])}
	{#if rows.length}
		{@const open = expanded[key]}
		<section class="flex flex-col gap-3 rounded border border-primary bg-secondary p-4">
			<div class="flex flex-col gap-0.5">
				<h2 class="text-xl font-bold">{title}</h2>
				<p class="text-sm text-secondary">{hint}</p>
			</div>
			<ProductMiniList rows={open ? rows : rows.slice(0, COLLAPSED_ROWS)} />
			{#if rows.length > COLLAPSED_ROWS}
				<button
					type="button"
					class={twMerge(components.button(), 'w-full')}
					aria-expanded={open}
					onclick={() => (expanded[key] = !open)}
				>
					{open ? m.store_hl_show_less() : m.store_hl_show_all({ count: rows.length })}
				</button>
			{/if}
		</section>
	{/if}
{/snippet}

{@render section('arrivals', m.store_hl_arrivals(), m.store_hl_arrivals_hint(), arrivals)}
{@render section('new', m.store_hl_new(), m.store_hl_new_hint(), newProducts)}
{@render section('sales', m.store_hl_sales(), m.store_hl_sales_hint(), sales)}
{@render section('value', m.store_hl_value(), m.store_hl_value_hint(), bestValue)}
