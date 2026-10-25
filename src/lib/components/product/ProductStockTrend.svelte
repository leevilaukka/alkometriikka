<script lang="ts">
	import { m } from '$lib/i18n';
	import { loadProductStock } from '$lib/alko/stock';
	import {
		daysBetween,
		productStockSeries,
		stockTrend,
		type StockPoint
	} from '$lib/utils/catalog/stock';
	import { twMerge } from 'tailwind-merge';

	const { productNumber, class: _class = '' }: { productNumber: string; class?: string } = $props();

	const TREND_DAYS = 30;
	const WIDTH = 96;
	const HEIGHT = 24;

	let series = $state<StockPoint[]>([]);

	// The prop re-reads the product it came from, which the product page swaps for the price
	// list's copy once loaded. The derived only changes with the number, so that doesn't refetch
	const currentNumber = $derived(productNumber);

	$effect(() => {
		const id = currentNumber;
		series = [];
		loadProductStock(id).then((shard) => {
			if (shard && id === currentNumber) series = productStockSeries(shard, id);
		});
	});

	const trend = $derived(stockTrend(series, TREND_DAYS));
	const shown = $derived(trend ? series.filter((point) => point.date >= trend.before.date) : []);
	const days = $derived(trend ? daysBetween(trend.before.date, trend.now.date) : 0);

	const points = $derived.by(() => {
		if (shown.length < 2) return '';
		const counts = shown.map((point) => point.count);
		const min = Math.min(...counts);
		const range = Math.max(...counts) - min || 1;
		const first = shown[0].date;
		const span = daysBetween(first, shown[shown.length - 1].date) || 1;
		return shown
			.map((point) => {
				const x = (daysBetween(first, point.date) / span) * WIDTH;
				const y = HEIGHT - 2 - ((point.count - min) / range) * (HEIGHT - 4);
				return `${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	});

	function stores(count: number) {
		return m.stores_count({ count });
	}
</script>

{#if trend}
	<div class={twMerge('flex items-center gap-2 text-sm', _class)}>
		<svg
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			width={WIDTH}
			height={HEIGHT}
			class={twMerge(
				'shrink-0 overflow-visible',
				trend.change < 0
					? 'text-red-700 dark:text-red-400'
					: trend.change > 0
						? 'text-green-700 dark:text-green-400'
						: 'text-secondary'
			)}
			aria-hidden="true"
		>
			<polyline
				{points}
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linejoin="round"
				stroke-linecap="round"
			/>
		</svg>
		<span class="text-secondary">
			{#if trend.change === 0}
				{m.stock_no_change({ days })}
			{:else}
				<strong
					class={trend.change < 0
						? 'text-red-700 dark:text-red-400'
						: 'text-green-700 dark:text-green-400'}
					>{trend.change > 0 ? '+' : '−'}{stores(Math.abs(trend.change))}</strong
				>
				{m.stock_change_over({ days, before: trend.before.count })}
			{/if}
		</span>
	</div>
{/if}
