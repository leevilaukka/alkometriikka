<script lang="ts">
	import type { Kaljakori } from '$lib/alko';
	import type { PriceListItem } from '$lib/types';
	import { computeQualityMetrics } from '$lib/utils/metrics';
	import { twMerge } from 'tailwind-merge';

	const {
		product,
		kaljakori,
		class: _class = ''
	}: { product: PriceListItem; kaljakori: Kaljakori; class?: string } = $props();

	const result = $derived(computeQualityMetrics(product, kaljakori));
</script>

{#if result.metrics.length > 0}
	<section class={twMerge('flex flex-col gap-3', _class)}>
		<div class="flex items-baseline gap-2">
			<h2 class="text-2xl font-bold">Hinta-laatu</h2>
			<span class="text-sm text-secondary">
				verrattuna muihin {result.categoryLabel}-tuotteisiin (n = {result.sampleSize})
			</span>
		</div>
		<div class="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
			{#each result.metrics as metric (metric.key)}
				<div class="flex flex-col gap-2 rounded border border-primary bg-primary p-3.5">
					<span class="text-sm text-secondary">{metric.label}</span>
					<strong class="text-2xl leading-tight font-bold">{metric.value}</strong>
					<div class="h-1.5 overflow-hidden rounded-full bg-secondary">
						<div class="h-full rounded-full bg-brand-3" style={`width: ${metric.barPercent}%`}></div>
					</div>
					<span class="text-sm text-secondary text-wrap-pretty">{metric.note}</span>
				</div>
			{/each}
		</div>
	</section>
{/if}
