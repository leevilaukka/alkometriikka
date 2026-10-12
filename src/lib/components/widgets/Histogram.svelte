<script lang="ts">
	import type { HistogramBin } from '$lib/utils/metrics';
	import { histogramBinIndex } from '$lib/utils/metrics';
	import { twMerge } from 'tailwind-merge';

	const {
		bins,
		highlight,
		format,
		label,
		class: _class = ''
	}: {
		bins: HistogramBin[];
		/** Value whose bar is emphasized, e.g. the median or the current product. */
		highlight?: number | null;
		format: (value: number) => string;
		label: string;
		class?: string;
	} = $props();

	const maxCount = $derived(Math.max(1, ...bins.map((bin) => bin.count)));
	const highlightIndex = $derived(highlight == null ? -1 : histogramBinIndex(bins, highlight));
</script>

{#if bins.length > 1}
	<div class={twMerge('flex flex-col gap-1', _class)}>
		<div class="flex h-20 items-end gap-0.5" role="img" aria-label={label}>
			{#each bins as bin, index (index)}
				<div
					class={twMerge(
						'flex-1 rounded-t-sm bg-brand-3/40',
						index === highlightIndex && 'bg-brand-3'
					)}
					style:height={`${Math.max(2, (bin.count / maxCount) * 100)}%`}
					title={`${format(bin.from)}–${format(bin.to)}: ${bin.count} tuotetta`}
				></div>
			{/each}
		</div>
		<div class="flex justify-between text-xs text-secondary">
			<span>≤ {format(bins[0].to)}</span>
			<span>≥ {format(bins[bins.length - 1].from)}</span>
		</div>
	</div>
{/if}
