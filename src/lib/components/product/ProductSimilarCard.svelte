<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import type { PriceListItem } from '$lib/types';
	import type { SimilarProductDelta } from '$lib/utils/metrics';
	import { compareProductIds } from '$lib/global.svelte';
	import {
		addToCompareWithReference,
		removeFromCompare,
		MAX_COMPARE_PRODUCTS
	} from '$lib/utils/compare';
	import ProductImage from '../widgets/ProductImage.svelte';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';

	const {
		reference,
		delta,
		class: _class = ''
	}: { reference: PriceListItem; delta: SimilarProductDelta; class?: string } = $props();

	const number = $derived(delta.product[AllColumns.Number]);
	const inCompare = $derived(compareProductIds.includes(number));

	function handleToggleCompare() {
		if (inCompare) {
			removeFromCompare(number);
			return;
		}
		// Selecting a candidate to compare implicitly compares it against the
		// reference product, so that product goes in first - anchored as the
		// reference the deltas are shown against - and only if both fit.
		if (!addToCompareWithReference(reference[AllColumns.Number], number)) {
			alert(`Voit vertailla korkeintaan ${MAX_COMPARE_PRODUCTS} tuotetta kerrallaan.`);
		}
	}

	function formatDelta(value: number, unit: string, decimals = 2) {
		if (Math.abs(value) < 10 ** -decimals / 2) return `±0 ${unit}`;
		const sign = value > 0 ? '+' : '';
		return `${sign}${value.toLocaleString('fi-FI', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${unit}`;
	}
</script>

<div class={twMerge('relative flex flex-col gap-2.5 rounded-lg border border-primary p-3.5', _class)}>
	{#if delta.isBestValue}
		<span
			class="absolute top-3.5 left-3.5 z-10 flex items-center gap-1 rounded bg-green-300 px-1.5 text-xs text-green-800 dark:bg-green-800/40 dark:text-green-300"
		>
			<Icon name="award" />
			<span>Paras g/€</span>
		</span>
	{/if}
	<a href={`/tuotteet/${number}/`} tabindex="-1" aria-hidden="true" class="flex aspect-square w-full rounded bg-white p-1.5">
		<ProductImage
			{number}
			name={delta.product[AllColumns.Name]}
			alt={delta.product[AllColumns.Name]}
			class="block h-full w-full object-contain"
		/>
	</a>
	<a href={`/tuotteet/${number}/`} class="flex flex-col gap-0.5 hover:underline">
		<div class="h-10 overflow-hidden">
			<h3 class="line-clamp-2 text-sm leading-tight font-bold">{delta.product[AllColumns.Name]}</h3>
		</div>
		<span class="text-xs text-secondary">
			{formatValue(delta.product[AllColumns.BottleSize], AllColumns.BottleSize)} · {formatValue(
				delta.product[AllColumns.AlcoholPercentage],
				AllColumns.AlcoholPercentage
			)}
		</span>
	</a>
	<div class="flex items-baseline justify-between gap-1.5">
		<p class="text-xl leading-tight font-bold">{formatValue(delta.product[AllColumns.Price], AllColumns.Price)}</p>
		<span class="text-xs text-secondary">
			{formatValue(delta.product[AllColumns.PricePerLiter], AllColumns.PricePerLiter)}
		</span>
	</div>
	<div class="flex flex-col overflow-hidden rounded border border-primary">
		<div class="flex items-baseline justify-between gap-1.5 border-b border-primary px-1.5 py-1">
			<span class="text-[10px] text-secondary">Hinta</span>
			<strong
				class={twMerge(
					'text-sm whitespace-nowrap tabular-nums',
					delta.deltaPrice < 0
						? 'text-green-700 dark:text-green-400'
						: delta.deltaPrice > 0
							? 'text-red-700 dark:text-red-400'
							: ''
				)}
			>
				{formatDelta(delta.deltaPrice, '€')}
			</strong>
		</div>
		<div class="flex items-baseline justify-between gap-1.5 px-1.5 py-1">
			<span class="text-[10px] text-secondary">g/€</span>
			<strong
				class={twMerge(
					'text-sm whitespace-nowrap tabular-nums',
					delta.deltaGramsPerEuro > 0
						? 'text-green-700 dark:text-green-400'
						: delta.deltaGramsPerEuro < 0
							? 'text-red-700 dark:text-red-400'
							: ''
				)}
			>
				{formatDelta(delta.deltaGramsPerEuro, 'g/€')}
			</strong>
		</div>
	</div>
	<button
		type="button"
		aria-pressed={inCompare}
		aria-label={`Vertaile: ${delta.product[AllColumns.Name]}`}
		class={twMerge(
			'mt-auto flex items-center justify-center gap-1.5 rounded px-2 py-1 text-sm',
			inCompare ? 'bg-brand-3 text-white' : 'border border-primary bg-primary hover:bg-secondary'
		)}
		onclick={handleToggleCompare}
	>
		<Icon name="compare" />
		<span>{inCompare ? 'Valittu' : 'Vertaile'}</span>
	</button>
</div>
