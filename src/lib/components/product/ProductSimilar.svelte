<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import { components } from '$lib/utils/styles';
	import type { PriceListItem } from '$lib/types';
	import { computeSimilarProductDeltas, groupSimilarProductsBySubType } from '$lib/utils/metrics';
	import { compareProductIds } from '$lib/global.svelte';
	import { addToCompareFirst, toggleCompare, MAX_COMPARE_PRODUCTS } from '$lib/utils/compare';
	import ProductImage from '../widgets/ProductImage.svelte';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';

	const {
		product,
		candidates,
		class: _class = ''
	}: { product: PriceListItem; candidates: PriceListItem[]; class?: string } = $props();

	let selectedChip: string | null = $state(null);

	const chips = $derived(groupSimilarProductsBySubType(candidates));
	const filteredCandidates = $derived(
		selectedChip ? candidates.filter((item) => item[AllColumns.SubType] === selectedChip) : candidates
	);
	const deltas = $derived(computeSimilarProductDeltas(product, filteredCandidates));

	function handleToggleCompare(number: string) {
		const wasInCompare = compareProductIds.includes(number);
		if (!toggleCompare(number)) {
			alert(`Voit vertailla korkeintaan ${MAX_COMPARE_PRODUCTS} tuotetta kerrallaan.`);
			return;
		}
		// Selecting a candidate to compare implicitly compares it against the
		// product currently being viewed, so make sure that product is included
		// too - anchored first since it's the reference the deltas are shown against.
		if (!wasInCompare && !compareProductIds.includes(product[AllColumns.Number])) {
			addToCompareFirst(product[AllColumns.Number]);
		}
	}

	function formatDelta(value: number, unit: string, decimals = 2) {
		if (Math.abs(value) < 10 ** -decimals / 2) return `±0 ${unit}`;
		const sign = value > 0 ? '+' : '';
		return `${sign}${value.toLocaleString('fi-FI', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${unit}`;
	}

	function sideScroll(node: HTMLElement) {
		function handleScroll(event: WheelEvent) {
			if (event.deltaY == 0) return;
			event.preventDefault();
			node.scrollBy({ left: event.deltaY });
		}

		node.addEventListener('wheel', handleScroll);

		return {
			destroy() {
				node.removeEventListener('wheel', handleScroll);
			}
		};
	}
</script>

{#if candidates.length > 0}
	<section class={twMerge('flex flex-col gap-3.5', _class)}>
		<div class="flex flex-wrap items-end justify-between gap-3.5">
			<div class="flex flex-col gap-0.5">
				<h2 class="text-2xl font-bold">Vertaa samankaltaisiin</h2>
				<p class="text-sm text-secondary">
					Erot suhteessa tuotteeseen {product[AllColumns.Name]} · {formatValue(
						product[AllColumns.Price],
						AllColumns.Price
					)}
				</p>
			</div>
			<a
				href={`/vastaavat/${product[AllColumns.Number]}`}
				class={twMerge(components.button({ size: 'sm' }), 'flex items-center gap-2')}
			>
				<span>Lisää samankaltaisia</span>
				<Icon name="arrow_right" />
			</a>
		</div>

		{#if chips.length > 1}
			<div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0">
				{#each chips as chip (chip.value ?? '__all__')}
					<button
						type="button"
						class={twMerge(
							'flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-sm',
							selectedChip === chip.value
								? 'bg-brand-3 text-white'
								: 'border border-primary bg-primary hover:bg-secondary'
						)}
						onclick={() => (selectedChip = chip.value)}
					>
						<span>{chip.label}</span>
						<span
							class={twMerge(
								'rounded px-1 text-xs',
								selectedChip === chip.value ? 'bg-white/20' : 'bg-secondary text-secondary'
							)}
						>
							{chip.count}
						</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if deltas.length > 0}
			<div class="-mx-4 flex flex-nowrap gap-3.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0" use:sideScroll>
				{#each deltas as delta (delta.product[AllColumns.Number])}
					<div class="relative flex w-44 shrink-0 flex-col gap-2.5 rounded-lg border border-primary p-3.5">
						{#if delta.isBestValue}
							<span
								class="absolute top-3.5 left-3.5 z-10 flex items-center gap-1 rounded bg-green-300 px-1.5 text-xs text-green-800 dark:bg-green-800/40 dark:text-green-300"
							>
								<Icon name="award" />
								<span>Paras g/€</span>
							</span>
						{/if}
						<a href={`/tuotteet/${delta.product[AllColumns.Number]}/`} class="flex aspect-square w-full rounded bg-white p-1.5">
							<ProductImage
								number={delta.product[AllColumns.Number]}
								name={delta.product[AllColumns.Name]}
								alt={delta.product[AllColumns.Name]}
								class="block h-full w-full object-contain"
							/>
						</a>
						<a href={`/tuotteet/${delta.product[AllColumns.Number]}/`} class="flex flex-col gap-0.5 hover:underline">
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
						<div class="grid grid-cols-2 overflow-hidden rounded border border-primary">
							<div class="flex flex-col border-r border-primary px-1.5 py-1">
								<span class="text-[10px] text-secondary">Hinta</span>
								<strong
									class={twMerge(
										'text-sm',
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
							<div class="flex flex-col px-1.5 py-1">
								<span class="text-[10px] text-secondary">g/€</span>
								<strong
									class={twMerge(
										'text-sm',
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
							class={twMerge(
								'mt-auto flex items-center justify-center gap-1.5 rounded px-2 py-1 text-sm',
								compareProductIds.includes(delta.product[AllColumns.Number])
									? 'bg-brand-3 text-white'
									: 'border border-primary bg-primary hover:bg-secondary'
							)}
							onclick={() => handleToggleCompare(delta.product[AllColumns.Number])}
						>
							<Icon name="compare" />
							<span>{compareProductIds.includes(delta.product[AllColumns.Number]) ? 'Valittu' : 'Vertaile'}</span>
						</button>
					</div>
				{/each}
			</div>
		{:else}
			<p class="rounded-lg border border-dashed border-primary p-6 text-center text-secondary">
				Ei tuotteita tällä rajauksella.
			</p>
		{/if}
	</section>
{/if}
