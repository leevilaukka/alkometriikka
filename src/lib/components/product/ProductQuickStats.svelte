<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import type { PriceListItem } from '$lib/types';
	import { twMerge } from 'tailwind-merge';

	const { product, class: _class = '' }: { product: PriceListItem; class?: string } = $props();

	// Always a 2x2 grid: this component is used inside a narrow desktop column
	// (not the full page width), so a viewport-based 4-across breakpoint would
	// crowd longer real-world values like "kcal/100ml" or "Muovipullo".
	const cellBorders = ['border-r border-b', 'border-b', 'border-r', ''];

	const stats = $derived([
		{ label: 'Alkoholi', value: formatValue(product[AllColumns.AlcoholPercentage], AllColumns.AlcoholPercentage) },
		{ label: 'Sokeri', value: formatValue(product[AllColumns.Sugar], AllColumns.Sugar) },
		{ label: 'Energia', value: formatValue(product[AllColumns.Energy] as number, AllColumns.Energy) },
		{ label: 'Pakkaus', value: product[AllColumns.PackagingType] || '–' }
	]);
</script>

<div class={twMerge('grid grid-cols-2 overflow-hidden rounded border border-primary', _class)}>
	{#each stats as stat, index (stat.label)}
		<div class={twMerge('flex min-w-0 flex-col gap-1 border-primary p-4', cellBorders[index])}>
			<span class="truncate text-xs text-secondary">{stat.label}</span>
			<strong class="text-lg wrap-break-word">{stat.value}</strong>
		</div>
	{/each}
</div>
