<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import { generateTitle, sendAnalyticsEvent, setSEO, handleShare } from '$lib/utils/helpers';
	import { formatCampaignWindow, getSaleInfo } from '$lib/utils/sales';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import Icon from '../widgets/Icon.svelte';
	import { type AvailabilityStore, type PriceListItem } from '$lib/types';
	import { afterNavigate } from '$app/navigation';
	import type { Kaljakori } from '$lib/alko';
	import { buildSizeOptions, findSimilarProducts } from '$lib/utils/filters';
	import {
		formatStoreDistance,
		getStoreDistance,
		rankStoresByDistance
	} from '$lib/utils/availability';
	import { generateImageUrl } from '$lib/utils/image';

	import ProductBreadcrumb from '../product/ProductBreadcrumb.svelte';
	import ProductGallery from '../product/ProductGallery.svelte';
	import ProductBadgesHeader from '../product/ProductBadgesHeader.svelte';
	import ProductPriceStoreBanner from '../product/ProductPriceStoreBanner.svelte';
	import ProductSizeDropdown from '../product/ProductSizeDropdown.svelte';
	import ProductSizeHook from '../product/ProductSizeHook.svelte';
	import ProductQuickStats from '../product/ProductQuickStats.svelte';
	import ProductPricePanel from '../product/ProductPricePanel.svelte';
	import ProductQualityMetrics from '../product/ProductQualityMetrics.svelte';
	import ProductSimilar from '../product/ProductSimilar.svelte';
	import ProductPriceHistory from '../product/ProductPriceHistory.svelte';
	import ProductDetailsTable from '../product/ProductDetailsTable.svelte';
	import ProductStoreAvailability from '../product/ProductStoreAvailability.svelte';

	const {
		product,
		kaljakori,
		availabilityStores,
		preferredStore,
		availabilityUpdated
	}: {
		product: PriceListItem;
		kaljakori: Kaljakori;
		availabilityStores: AvailabilityStore[];
		preferredStore?: AvailabilityStore;
		availabilityUpdated: Date | undefined;
	} = $props();

	const rankedAvailabilityStores = $derived(
		rankStoresByDistance(availabilityStores, preferredStore)
	);
	const availableInPreferredStore = $derived(
		preferredStore
			? availabilityStores.some((store) => store.id === preferredStore.id)
			: false
	);
	const closestAvailableStore = $derived(rankedAvailabilityStores[0]);
	const closestAvailableDistance = $derived(
		formatStoreDistance(getStoreDistance(preferredStore, closestAvailableStore))
	);

	let productElement: HTMLDivElement;

	const sizeOptions = $derived(buildSizeOptions(product, kaljakori));
	const cheapestSize = $derived(sizeOptions.find((size) => size.isBestValue));

	const similarProducts = $derived(
		findSimilarProducts(
			product,
			kaljakori,
			new Set([
				AllColumns.Type,
				AllColumns.SubType,
				AllColumns.BeerType,
				AllColumns.Price,
				AllColumns.BottleSize,
				AllColumns.Sugar,
				AllColumns.PackagingType,
				AllColumns.AlcoholGramsPerEuro,
				AllColumns.GrapeVarieties,
				AllColumns.Description
			]),
			24
		)
	);

	const sale = $derived(
		getSaleInfo({
			price: product[AllColumns.Price],
			normalPrice: product[AllColumns.NormalPrice],
			campaignStart: product[AllColumns.CampaignStart],
			campaignEnd: product[AllColumns.CampaignEnd]
		})
	);
	const campaignWindow = $derived(sale ? formatCampaignWindow(sale) : null);

	afterNavigate(() => {
		productElement?.scrollIntoView({ behavior: 'smooth' });
	});

	$effect(() => {
		setSEO({
			description: `Katso ${product[AllColumns.Name]} -tuotteen tiedot, hinnat ja vastaavat tuotteet Alkometriikasta.`,
			og: {
				title: generateTitle(`${product[AllColumns.Name]}`),
				description: `Katso ${product[AllColumns.Name]} -tuotteen tiedot, hinnat ja vastaavat tuotteet Alkometriikasta.`,
				url: `https://alkometriikka.fi/tuotteet/${product[AllColumns.Number]}/`
			},
			image: {
				alt: product[AllColumns.Name],
				url: generateImageUrl(product[AllColumns.Number], 'medium'),
				width: '160',
				height: '192'
			},
			twitter: {
				card: 'summary_large_image',
				title: generateTitle(`${product[AllColumns.Name]}`),
				description: `Katso ${product[AllColumns.Name]} -tuotteen tiedot, hinnat ja vastaavat tuotteet Alkometriikasta.`,
				image: generateImageUrl(product[AllColumns.Number], 'medium')
			},
			keywords: `${product[AllColumns.Name]}, ${product[AllColumns.Manufacturer]}, ${product[AllColumns.Type]}, ${product[AllColumns.SubType]}, ${[...(product[AllColumns.Description] || [])].join(', ').toLocaleLowerCase()}`
		});
	});
</script>

<svelte:head>
	<title>{generateTitle(`${product[AllColumns.Name]}`)}</title>
</svelte:head>

<div
	bind:this={productElement}
	class={twMerge('mx-auto flex w-full max-w-7xl flex-col flex-nowrap gap-6 p-6')}
>
	<div class="flex w-full items-center gap-3.5">
		<ProductBreadcrumb {product} class="min-w-0 flex-1" />
		<button
			type="button"
			class={twMerge(components.button({ size: 'sm', type: 'positive' }), 'ml-auto flex shrink-0 items-center gap-2')}
			onclick={async () => {
				const shared = await handleShare({
					type: 'product',
					text: `Katso ${product[AllColumns.Name]} -tuotteen tiedot, hinnat ja vastaavat tuotteet Alkometriikasta.`,
					url: location.href,
					title: `Alkometriikka - ${product[AllColumns.Name]}`,
					includeSID: true
				});

				if (!shared) {
					alert('Linkki kopioitu leikepöydälle!');
				}
			}}
		>
			<Icon name="share" />
			<span class="hidden sm:inline">Jaa tuote</span>
		</button>
	</div>

	<div class="grid w-full grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)_320px] lg:items-start">
		<ProductGallery {product} {sale} />

		<div class="flex flex-col gap-4">
			<ProductBadgesHeader {product} {sale} />

			<ProductPriceStoreBanner
				class="lg:hidden"
				{product}
				{sale}
				{campaignWindow}
				{preferredStore}
				{availableInPreferredStore}
				{closestAvailableStore}
				{closestAvailableDistance}
			/>

			<ProductSizeDropdown {product} sizes={sizeOptions} />

			<ProductQuickStats {product} />
		</div>

		<ProductPricePanel
			class="hidden lg:flex"
			{product}
			{sale}
			{campaignWindow}
			{preferredStore}
			{availableInPreferredStore}
			{closestAvailableStore}
			{closestAvailableDistance}
			{cheapestSize}
		/>
	</div>

	{#if cheapestSize && !cheapestSize.isCurrent}
		<ProductSizeHook size={cheapestSize} class="lg:hidden" />
	{/if}

	<ProductQualityMetrics {product} {kaljakori} />

	<ProductSimilar {product} candidates={similarProducts} />

	<div class="grid w-full grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
		<div class="flex flex-col gap-6">
			<ProductPriceHistory {product} />
			<ProductDetailsTable {product} class="hidden lg:block" />
		</div>
		<ProductStoreAvailability
			id="myymalasaatavuus"
			productNumber={product[AllColumns.Number]}
			stores={rankedAvailabilityStores}
			{preferredStore}
			{availabilityUpdated}
		/>
	</div>

	<ProductDetailsTable {product} asDetails class="lg:hidden" />
</div>
