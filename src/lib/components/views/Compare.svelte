<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import { getSaleInfo } from '$lib/utils/sales';
	import { generateTitle, handleShare, setSEO } from '$lib/utils/helpers';
	import { components } from '$lib/utils/styles';
	import { computeComparisonRows, getBestProductNumbers } from '$lib/utils/metrics';
	import { compareURL, removeFromCompare, MAX_COMPARE_PRODUCTS } from '$lib/utils/compare';
	import { goto } from '$app/navigation';
	import { twMerge } from 'tailwind-merge';
	import type { PriceListItem } from '$lib/types';
	import Icon from '../widgets/Icon.svelte';
	import ProductImage from '../widgets/ProductImage.svelte';
	import BadgeList from '../widgets/BadgeList.svelte';

	const { products }: { products: PriceListItem[] } = $props();

	const bestPrice = $derived(getBestProductNumbers(products, AllColumns.Price));
	const bestPricePerLiter = $derived(getBestProductNumbers(products, AllColumns.PricePerLiter));
	const rows = $derived(computeComparisonRows(products));

	function handleBack() {
		if (window.history.length > 1) window.history.back();
		else goto('/');
	}

	function handleRemove(id: string) {
		removeFromCompare(id);
		const remaining = products.map((p) => p[AllColumns.Number]).filter((n) => n !== id);
		if (remaining.length === 0) goto('/');
		else goto(compareURL(remaining), { replaceState: true, noScroll: true, keepFocus: true });
	}

	$effect(() => {
		setSEO({
			description: `Vertaile ${products.map((p) => p[AllColumns.Name]).join(', ')} rinnakkain Alkometriikassa.`,
			og: {
				title: generateTitle('Tuotevertailu'),
				url: window.location.href,
				description: `Vertaile ${products.map((p) => p[AllColumns.Name]).join(', ')} rinnakkain Alkometriikassa.`
			}
		});
	});
</script>

<svelte:head>
	<title>{generateTitle('Tuotevertailu')}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-350 flex-col gap-6 p-4 md:p-6">
	<div class="flex w-full flex-wrap items-center gap-3.5">
		<button onclick={handleBack} class={twMerge(components.button({ size: 'md' }))}>
			<Icon name={window.history.length > 1 ? 'arrow_back' : 'home'} class="inline-block" />
			<span>{window.history.length > 1 ? 'Takaisin' : 'Etusivulle'}</span>
		</button>
		<h1 class="text-xl font-bold md:text-2xl">Tuotevertailu</h1>
		{#if products.length > 0}
			<button
				type="button"
				class={twMerge(components.button({ size: 'sm', type: 'positive' }), 'ml-auto flex shrink-0 items-center gap-2')}
				onclick={async () => {
					const shared = await handleShare({
						type: 'compare',
						text: `Vertaile: ${products.map((p) => p[AllColumns.Name]).join(', ')}`,
						url: location.href,
						title: generateTitle('Tuotevertailu'),
						includeSID: true
					});
					if (!shared) alert('Linkki kopioitu leikepöydälle!');
				}}
			>
				<Icon name="share" />
				<span class="hidden sm:inline">Jaa vertailu</span>
			</button>
		{/if}
	</div>

	{#if products.length === 0}
		<div class="mx-auto flex flex-col items-center gap-4 py-16 text-center prose dark:prose-invert">
			<h2>Vertailu on tyhjä</h2>
			<p>Lisää tuotteita vertailuun tuotevalikosta "Vertaile"-painikkeella.</p>
			<a href="/" class={twMerge(components.button({ type: 'positive' }), 'mx-auto w-fit')}>
				<span>Tuotevalikkoon</span>
				<Icon name="arrow_right_stroke" />
			</a>
		</div>
	{:else}
		<p class="text-sm text-secondary">
			{products.length}/{MAX_COMPARE_PRODUCTS} tuotetta vertailussa. Kunkin rivin paras arvo on korostettu, kun sillä on objektiivisesti paras vaihtoehto.
		</p>
		<div class="overflow-x-auto rounded border border-primary">
			<div
				class="grid w-fit min-w-full"
				style={`grid-template-columns: 160px repeat(${products.length}, minmax(220px, 1fr));`}
			>
				<!-- Header row: product image, name, remove -->
				<div class="sticky left-0 z-10 border-b border-primary bg-secondary p-3"></div>
				{#each products as product (product[AllColumns.Number])}
					<div class="relative flex flex-col items-center gap-2 border-b border-s border-primary bg-primary p-3">
						<button
							aria-label={`Poista ${product[AllColumns.Name]} vertailusta`}
							onclick={() => handleRemove(product[AllColumns.Number])}
							class="absolute top-1.5 inset-e-1.5 grid h-6 w-6 place-content-center rounded-full text-secondary hover:bg-secondary"
						>
							<Icon name="x" />
						</button>
						<div class="flex aspect-square w-24 shrink-0 rounded bg-white p-1.5">
							<ProductImage number={product[AllColumns.Number]} name={product[AllColumns.Name]} />
						</div>
						<a href={`/tuotteet/${product[AllColumns.Number]}/`} class="text-center font-bold hover:underline">
							{product[AllColumns.Name]}
						</a>
						<span class="text-center text-sm text-secondary">
							{product[AllColumns.Manufacturer]}
						</span>
						<div class="flex flex-row flex-wrap items-center justify-center gap-1.5">
							<BadgeList item={product} />
						</div>
					</div>
				{/each}

				<!-- Price row -->
				<div class="sticky left-0 z-10 flex items-center border-b border-primary bg-secondary p-3 text-sm text-secondary">
					Hinta
				</div>
				{#each products as product (product[AllColumns.Number])}
					{@const sale = getSaleInfo({
						price: product[AllColumns.Price],
						normalPrice: product[AllColumns.NormalPrice],
						campaignStart: product[AllColumns.CampaignStart],
						campaignEnd: product[AllColumns.CampaignEnd]
					})}
					{@const isBest = bestPrice.has(product[AllColumns.Number])}
					<div
						class={twMerge(
							'flex flex-col items-center gap-0.5 border-b border-s border-primary p-3',
							isBest && 'bg-green-50 dark:bg-green-950'
						)}
					>
						<div class="flex items-center gap-2">
							{#if sale}
								<span class="text-sm text-secondary line-through">
									{formatValue(sale.normalPrice, AllColumns.NormalPrice)}
								</span>
							{/if}
							<strong class="text-xl">{formatValue(product[AllColumns.Price], AllColumns.Price)}</strong>
						</div>
						{#if isBest}
							<span class={twMerge(components.badge({ color: 'green' }), 'w-fit')}>Halvin</span>
						{/if}
					</div>
				{/each}

				<!-- Price per liter row -->
				<div class="sticky left-0 z-10 flex items-center border-b border-primary bg-secondary p-3 text-sm text-secondary">
					Litrahinta
				</div>
				{#each products as product (product[AllColumns.Number])}
					{@const isBest = bestPricePerLiter.has(product[AllColumns.Number])}
					<div
						class={twMerge(
							'flex flex-col items-center gap-0.5 border-b border-s border-primary p-3',
							isBest && 'bg-green-50 dark:bg-green-950'
						)}
					>
						<span>{formatValue(product[AllColumns.PricePerLiter], AllColumns.PricePerLiter)}</span>
						{#if isBest}
							<span class={twMerge(components.badge({ color: 'green' }), 'w-fit')}>Edullisin</span>
						{/if}
					</div>
				{/each}

				<!-- Bottle size row -->
				<div class="sticky left-0 z-10 flex items-center border-b border-primary bg-secondary p-3 text-sm text-secondary">
					Pakkauskoko
				</div>
				{#each products as product (product[AllColumns.Number])}
					<div class="flex items-center justify-center border-b border-s border-primary p-3">
						{formatValue(product[AllColumns.BottleSize], AllColumns.BottleSize)}
					</div>
				{/each}

				<!-- Alcohol percentage row -->
				<div class="sticky left-0 z-10 flex items-center border-b border-primary bg-secondary p-3 text-sm text-secondary">
					Alkoholi
				</div>
				{#each products as product (product[AllColumns.Number])}
					<div class="flex items-center justify-center border-b border-s border-primary p-3">
						{formatValue(product[AllColumns.AlcoholPercentage], AllColumns.AlcoholPercentage)}
					</div>
				{/each}

				<!-- Remaining rows generated from the full dataset -->
				{#each rows as row (row.key)}
					<div class="sticky left-0 z-10 flex items-center border-b border-primary bg-secondary p-3 text-sm text-secondary">
						{row.label}
					</div>
					{#each row.cells as cell (cell.product[AllColumns.Number])}
						<div
							class={twMerge(
								'flex items-center justify-center border-b border-s border-primary p-3 text-center text-wrap-pretty',
								cell.isBest && 'bg-green-50 dark:bg-green-950'
							)}
						>
							{cell.value}
						</div>
					{/each}
				{/each}
			</div>
		</div>
	{/if}
</div>
