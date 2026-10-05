<script lang="ts">
	import { findSimilarProducts, SIMILAR_PRODUCT_COLUMNS } from '$lib/utils/filters';
	import { twMerge } from 'tailwind-merge';
	import { AllColumns } from '$lib/utils/constants';
	import type { PriceListItem } from '$lib/types';
	import type { Kaljakori } from '$lib/alko';
	import { components } from '$lib/utils/styles';
	import { compareProductIds } from '$lib/global.svelte';
	import { toggleCompare, MAX_COMPARE_PRODUCTS } from '$lib/utils/compare';
	import { generateTitle, setSEO } from '$lib/utils/helpers';
	import { formatValue } from '$lib/utils/format';
	import { generateImageUrl } from '$lib/utils/image';
	import {
		computeSimilarProductDeltas,
		groupSimilarProductsBySubType,
		similarProductSubType
	} from '$lib/utils/metrics';
	import Icon from '../widgets/Icon.svelte';
	import ProductImage from '../widgets/ProductImage.svelte';
	import ProductBreadcrumb from '../product/ProductBreadcrumb.svelte';
	import ProductSimilarCard from '../product/ProductSimilarCard.svelte';
	import ProductSimilarChips from '../product/ProductSimilarChips.svelte';

	const { product, kaljakori }: { product: PriceListItem; kaljakori: Kaljakori } = $props();

	// Similarity drops off quickly, and sorting the whole catalogue by price would
	// just surface the cheapest products overall, so only the closest matches count.
	const POOL_SIZE = 200;
	const PAGE_SIZE = 48;

	const sortOptions = [
		{ value: 'similar', label: 'Vastaavin' },
		{ value: 'price', label: 'Halvin' },
		{ value: 'value', label: 'Paras g/€' }
	] as const;
	type SortValue = (typeof sortOptions)[number]['value'];

	let selectedChip: string | null = $state(null);
	let sort: SortValue = $state('similar');
	let showRemoved = $state(false);
	let visibleCount = $state(PAGE_SIZE);

	const rankedProducts = $derived(
		findSimilarProducts(product, kaljakori, SIMILAR_PRODUCT_COLUMNS, kaljakori.data.length)
	);
	const removedCount = $derived(
		rankedProducts.slice(0, POOL_SIZE).filter((item) => item[AllColumns.RemovedFromSelection]).length
	);
	const candidates = $derived(
		(showRemoved
			? rankedProducts
			: rankedProducts.filter((item) => !item[AllColumns.RemovedFromSelection])
		).slice(0, POOL_SIZE)
	);

	const chips = $derived(groupSimilarProductsBySubType(candidates));
	const deltas = $derived.by(() => {
		const filtered = selectedChip
			? candidates.filter((item) => similarProductSubType(item) === selectedChip)
			: candidates;
		const deltas = computeSimilarProductDeltas(product, filtered);
		if (sort === 'price') deltas.sort((a, b) => a.deltaPrice - b.deltaPrice);
		else if (sort === 'value') deltas.sort((a, b) => b.deltaGramsPerEuro - a.deltaGramsPerEuro);
		return deltas;
	});
	const visibleDeltas = $derived(deltas.slice(0, visibleCount));

	// Start from the top of the list whenever what it contains changes
	$effect(() => {
		void selectedChip;
		void sort;
		void showRemoved;
		visibleCount = PAGE_SIZE;
	});

	// A chip can disappear when removed products are hidden again
	$effect(() => {
		if (selectedChip && !chips.some((chip) => chip.value === selectedChip)) selectedChip = null;
	});

	const inCompare = $derived(compareProductIds.includes(product[AllColumns.Number]));

	function handleToggleCompare() {
		if (!toggleCompare(product[AllColumns.Number])) {
			alert(`Voit vertailla korkeintaan ${MAX_COMPARE_PRODUCTS} tuotetta kerrallaan.`);
		}
	}

	const title = $derived(generateTitle(`Samankaltaisia kuin ${product[AllColumns.Name]}`));
	const description = $derived(
		`Katso samankaltaisia tuotteita kuin ${product[AllColumns.Name]} Alkometriikasta. Vertaa hintoja, ominaisuuksia ja löydä parhaat vaihtoehdot.`
	);

	$effect(() => {
		setSEO({
			description,
			og: {
				title,
				url: `https://alkometriikka.fi/vastaavat/${product[AllColumns.Number]}`,
				type: 'website',
				description
			},
			twitter: {
				title,
				description,
				image: generateImageUrl(product[AllColumns.Number], 'medium'),
				card: 'summary_large_image'
			},
			image: {
				url: generateImageUrl(product[AllColumns.Number], 'medium'),
				alt: product[AllColumns.Name],
				height: 192,
				width: 160
			}
		});
	});
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col flex-nowrap gap-6 p-6">
	<ProductBreadcrumb {product} {kaljakori} page="Vastaavat" />

	<div class="flex flex-col gap-0.5">
		<h1 class="text-2xl font-bold md:text-3xl">Samankaltaisia tuotteita</h1>
		<p class="text-sm text-secondary">
			{candidates.length} lähintä vastinetta, erot suhteessa alla olevaan tuotteeseen
		</p>
	</div>

	<!-- The reference stays in view so the deltas on every card have context. The backdrop keeps a
	     gap above it and hides cards scrolling past its rounded corners; the negative margins cancel
	     its padding so the layout is unchanged until it sticks. -->
	<div class="sticky top-0 z-20 -mx-6 bg-primary sm:mx-0 sm:-my-4 sm:py-4">
		<div
			class="flex items-center gap-3.5 border-b border-primary bg-primary px-6 py-3 sm:rounded-lg sm:border sm:px-3.5"
		>
			<a
				href={`/tuotteet/${product[AllColumns.Number]}/`}
				tabindex="-1"
				aria-hidden="true"
				class="flex size-14 shrink-0 rounded bg-white p-1"
			>
				<ProductImage
					number={product[AllColumns.Number]}
					name={product[AllColumns.Name]}
					alt={product[AllColumns.Name]}
					class="block h-full w-full object-contain"
				/>
			</a>
			<div class="flex min-w-0 flex-1 flex-col">
				<span class="text-xs text-secondary">Vertailukohta</span>
				<a href={`/tuotteet/${product[AllColumns.Number]}/`} class="truncate font-bold hover:underline">
					{product[AllColumns.Name]}
				</a>
				<span class="truncate text-xs text-secondary">
					{formatValue(product[AllColumns.BottleSize], AllColumns.BottleSize)} · {formatValue(
						product[AllColumns.AlcoholPercentage],
						AllColumns.AlcoholPercentage
					)} · {formatValue(product[AllColumns.AlcoholGramsPerEuro], AllColumns.AlcoholGramsPerEuro)}
				</span>
			</div>
			<div class="hidden shrink-0 flex-col items-end sm:flex">
				<strong class="text-xl leading-tight">{formatValue(product[AllColumns.Price], AllColumns.Price)}</strong>
				<span class="text-xs text-secondary">
					{formatValue(product[AllColumns.PricePerLiter], AllColumns.PricePerLiter)}
				</span>
			</div>
			<button
				type="button"
				aria-pressed={inCompare}
				onclick={handleToggleCompare}
				class={twMerge(components.button({ size: 'sm', type: inCompare ? 'positive' : 'primary' }), 'shrink-0')}
			>
				<Icon name="compare" />
				<span class="hidden sm:inline">{inCompare ? 'Vertailussa' : 'Vertaile'}</span>
			</button>
		</div>
	</div>

	<div class="flex flex-col gap-3.5">
		<div class="flex flex-wrap items-center justify-between gap-3.5">
			<div class="flex gap-2" role="group" aria-label="Järjestys">
				{#each sortOptions as option (option.value)}
					<button
						type="button"
						aria-pressed={sort === option.value}
						class={twMerge(
							'rounded px-2.5 py-1 text-sm',
							sort === option.value
								? 'bg-brand-3 text-white'
								: 'border border-primary bg-primary hover:bg-secondary'
						)}
						onclick={() => (sort = option.value)}
					>
						{option.label}
					</button>
				{/each}
			</div>
			{#if removedCount > 0}
				<label class="flex items-center gap-2 text-sm text-secondary">
					<input type="checkbox" bind:checked={showRemoved} />
					<span>Näytä valikoimasta poistuneet ({removedCount})</span>
				</label>
			{/if}
		</div>

		{#if chips.length > 1}
			<ProductSimilarChips {chips} bind:selected={selectedChip} />
		{/if}
	</div>

	{#if visibleDeltas.length > 0}
		<div class="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
			{#each visibleDeltas as delta (delta.product[AllColumns.Number])}
				<ProductSimilarCard reference={product} {delta} />
			{/each}
		</div>
		{#if deltas.length > visibleCount}
			<button
				type="button"
				class={twMerge(components.button({ size: 'md' }), 'mx-auto')}
				onclick={() => (visibleCount += PAGE_SIZE)}
			>
				<span>Näytä lisää</span>
				<span class="text-sm text-secondary">{visibleCount} / {deltas.length}</span>
			</button>
		{/if}
	{:else}
		<p class="rounded-lg border border-dashed border-primary p-6 text-center text-secondary">
			Ei tuotteita tällä rajauksella.
		</p>
	{/if}
</div>
