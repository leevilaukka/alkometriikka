<script lang="ts">
	import type { PriceListItem } from '$lib/types';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { formatRoundedPricePerLiter, formatValue } from '$lib/utils/format/format';
	import { computeCategoryStats } from '$lib/utils/stats/metrics';
	import Histogram from '../widgets/Histogram.svelte';
	import CategorySection from './CategorySection.svelte';
	import { m } from '$lib/i18n';

	const { products, open = false }: { products: PriceListItem[]; open?: boolean } = $props();

	const stats = $derived(computeCategoryStats(products));
	const bins = $derived(stats.pricePerLiterHistogram);

	const medians = $derived(
		[
			{ label: m.column_price(), value: stats.medianPrice, key: AllColumns.Price },
			{
				label: m.column_price_per_liter(),
				value: stats.medianPricePerLiter,
				key: AllColumns.PricePerLiter
			},
			{
				label: m.column_alcohol_percentage(),
				value: stats.medianAlcoholPercentage,
				key: AllColumns.AlcoholPercentage
			},
			{
				label: m.category_alcohol_per_euro(),
				value: stats.medianAlcoholGramsPerEuro,
				key: AllColumns.AlcoholGramsPerEuro
			}
		].filter((item) => item.value !== null)
	);
</script>

<CategorySection title={m.category_median_product()} {open}>
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
			<figcaption class="text-xs text-secondary">
				{m.category_price_per_liter_distribution()}
			</figcaption>
			<Histogram
				{bins}
				highlight={stats.medianPricePerLiter}
				format={formatRoundedPricePerLiter}
				label={m.category_histogram_label()}
			/>
		</figure>
	{/if}
</CategorySection>
