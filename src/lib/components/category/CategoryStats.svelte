<script lang="ts">
	import type { PriceListItem } from '$lib/types';
	import { AllColumns } from '$lib/utils/constants';
	import { formatRoundedPricePerLiter, formatValue } from '$lib/utils/format';
	import { computeCategoryStats } from '$lib/utils/metrics';
	import Histogram from '../widgets/Histogram.svelte';

	const { products }: { products: PriceListItem[] } = $props();

	const stats = $derived(computeCategoryStats(products));
	const bins = $derived(stats.pricePerLiterHistogram);

	const medians = $derived(
		[
			{ label: 'Hinta', value: stats.medianPrice, key: AllColumns.Price },
			{ label: 'Litrahinta', value: stats.medianPricePerLiter, key: AllColumns.PricePerLiter },
			{ label: 'Alkoholi', value: stats.medianAlcoholPercentage, key: AllColumns.AlcoholPercentage },
			{ label: 'Alkoholia eurolla', value: stats.medianAlcoholGramsPerEuro, key: AllColumns.AlcoholGramsPerEuro }
		].filter((item) => item.value !== null)
	);
</script>

<section class="flex flex-col gap-3">
	<h2 class="text-sm font-bold">Mediaanituote</h2>
	<dl class="grid grid-cols-2 gap-2 text-sm">
		{#each medians as item (item.key)}
			<div class="flex flex-col rounded border border-primary bg-primary px-3 py-2">
				<dt class="text-xs text-secondary">{item.label}</dt>
				<dd>{formatValue(item.value as number, item.key)}</dd>
			</div>
		{/each}
	</dl>
	{#if bins.length > 1}
		<figure class="flex flex-col gap-1">
			<figcaption class="text-xs text-secondary">Litrahintojen jakauma</figcaption>
			<Histogram
				{bins}
				highlight={stats.medianPricePerLiter}
				format={formatRoundedPricePerLiter}
				label="Pylväskaavio tuotteiden litrahinnoista, mediaanin pylväs korostettuna"
			/>
		</figure>
	{/if}
</section>
