<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import type { PriceChange } from '$lib/utils/metrics';
	import { formatPriceChangeDate, formatPriceChangePercent, isPriceDrop } from '$lib/utils/priceChanges';
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';

	/**
	 * Rows of price changes, newest first. With `pageSize` only that many rows are
	 * rendered at first and a button below the list shows more.
	 */
	const {
		changes,
		pageSize,
		class: _class = ''
	}: { changes: PriceChange[]; pageSize?: number; class?: string } = $props();

	let pages = $state(1);
	const visible = $derived(pageSize ? changes.slice(0, pageSize * pages) : changes);

	// A new set of changes (another filter) starts from the first page again
	$effect(() => {
		void changes;
		pages = 1;
	});
</script>

<ul class={twMerge('rounded border border-primary bg-primary text-sm', _class)}>
	{#each visible as change (change.product[AllColumns.Number])}
		{@const cheaper = isPriceDrop(change)}
		<li class="flex items-center gap-2 border-t border-primary px-3 py-2 first:border-t-0">
			<div class="flex min-w-0 flex-1 flex-col">
				<a
					href={`/tuotteet/${change.product[AllColumns.Number]}/`}
					class="truncate hover:underline"
					title={change.product[AllColumns.Name]}
				>
					{change.product[AllColumns.Name]}
				</a>
				<span class="text-xs text-secondary">
					{formatPriceChangeDate(change.date)} · {formatValue(change.from, AllColumns.Price)} → {formatValue(
						change.to,
						AllColumns.Price
					)}{change.sale ? ' · tarjous' : ''}
				</span>
			</div>
			<span
				class={twMerge(
					'shrink-0 font-bold',
					cheaper ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
				)}
			>
				{formatPriceChangePercent(change.percent)}
			</span>
		</li>
	{/each}
</ul>
{#if visible.length < changes.length}
	<button type="button" class={twMerge(components.button(), 'w-full')} onclick={() => (pages += 1)}>
		Näytä lisää ({(changes.length - visible.length).toLocaleString('fi-FI')} jäljellä)
	</button>
{/if}
