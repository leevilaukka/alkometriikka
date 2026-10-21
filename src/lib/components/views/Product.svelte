<script lang="ts">
	import { productName, translateValue } from '$lib/i18n/values';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { handleShare } from '$lib/utils/app/share';
	import { formatCampaignWindow, getSaleInfo } from '$lib/utils/catalog/sales';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/ui/styles';
	import Icon from '../widgets/Icon.svelte';
	import { type AvailabilityStore, type PriceListItem } from '$lib/types';
	import { afterNavigate } from '$app/navigation';
	import type { Kaljakori } from '$lib/alko';
	import {
		buildSizeOptions,
		findSimilarProducts,
		SIMILAR_PRODUCT_COLUMNS
	} from '$lib/utils/catalog/filters';
	import {
		formatStoreDistance,
		getStoreDistance,
		rankStoresByDistance
	} from '$lib/utils/catalog/availability';
	import { generateImageUrl } from '$lib/utils/catalog/alko';
	import { productDescription } from '$lib/utils/app/seo';

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
	import ProductMobileCta from '../product/ProductMobileCta.svelte';
	import { pageBottomBar } from '$lib/global.svelte';
	import { intlLocale, locale, m } from '$lib/i18n';

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
		preferredStore ? availabilityStores.some((store) => store.id === preferredStore.id) : false
	);
	const closestAvailableStore = $derived(rankedAvailabilityStores[0]);
	const closestAvailableDistance = $derived(
		formatStoreDistance(getStoreDistance(preferredStore, closestAvailableStore))
	);

	let productElement: HTMLDivElement;

	const sizeOptions = $derived(buildSizeOptions(product, kaljakori));
	const cheapestSize = $derived(sizeOptions.find((size) => size.isBestValue));

	// Removed products can't be bought, so they make no sense as alternatives here
	const similarProducts = $derived(
		findSimilarProducts(product, kaljakori, SIMILAR_PRODUCT_COLUMNS, kaljakori.data.length)
			.filter((item) => !item[AllColumns.RemovedFromSelection])
			.slice(0, 24)
	);

	const sale = $derived(
		getSaleInfo({
			price: product[AllColumns.Price],
			normalPrice: product[AllColumns.NormalPrice],
			campaignStart: product[AllColumns.CampaignStart],
			campaignEnd: product[AllColumns.CampaignEnd]
		})
	);
	const campaignWindow = $derived(sale ? formatCampaignWindow(sale, intlLocale) : null);

	afterNavigate(() => {
		productElement?.scrollIntoView({ behavior: 'smooth' });
	});

	$effect(() => {
		const description = productDescription(
			{
				name: productName(product),
				category: [
					translateValue(product[AllColumns.Type], AllColumns.Type),
					translateValue(product[AllColumns.SubType], AllColumns.SubType)
				]
					.filter(Boolean)
					.join(' / '),
				volume: product[AllColumns.BottleSize],
				alcoholPercentage: product[AllColumns.AlcoholPercentage],
				price: product[AllColumns.Price],
				pricePerLitre: product[AllColumns.PricePerLiter]
			},
			locale
		);
		setSEO({
			description,
			og: {
				title: generateTitle(`${productName(product)}`),
				description,
				url: `https://alkometriikka.fi/tuotteet/${product[AllColumns.Number]}/`
			},
			image: {
				alt: productName(product),
				url: generateImageUrl(product[AllColumns.Number], 'medium'),
				width: '160',
				height: '192'
			},
			twitter: {
				card: 'summary_large_image',
				title: generateTitle(`${productName(product)}`),
				description,
				image: generateImageUrl(product[AllColumns.Number], 'medium')
			},
			keywords: [
				productName(product),
				product[AllColumns.Manufacturer],
				translateValue(product[AllColumns.Type], AllColumns.Type),
				translateValue(product[AllColumns.SubType], AllColumns.SubType),
				...[...(product[AllColumns.Description] || [])].map((word) =>
					translateValue(word, AllColumns.Description).toLocaleLowerCase()
				)
			]
				.filter(Boolean)
				.join(', ')
		});
	});

	// Price, compare and add-to-list bar for screens without the side price panel
	$effect(() => {
		if (!product) return;
		pageBottomBar.snippet = mobileCta;
		return () => {
			if (pageBottomBar.snippet === mobileCta) pageBottomBar.snippet = undefined;
		};
	});
</script>

{#snippet mobileCta()}
	<ProductMobileCta {product} class="lg:hidden" />
{/snippet}

<svelte:head>
	<title>{generateTitle(`${productName(product)}`)}</title>
</svelte:head>

<div
	bind:this={productElement}
	class={twMerge('mx-auto flex w-full max-w-7xl flex-col flex-nowrap gap-6 p-6')}
>
	<div class="flex w-full items-center gap-3.5">
		<ProductBreadcrumb {product} {kaljakori} class="min-w-0 flex-1" />
		<button
			type="button"
			class={twMerge(
				components.button({ size: 'sm', type: 'positive' }),
				'ml-auto flex shrink-0 items-center gap-2'
			)}
			onclick={async () => {
				const shared = await handleShare({
					type: 'product',
					text: m.product_share_text({ name: productName(product) }),
					url: location.href,
					title: `Alkometriikka - ${productName(product)}`,
					includeSID: true
				});

				if (!shared) {
					alert(m.share_link_copied());
				}
			}}
		>
			<Icon name="share" />
			<span class="hidden sm:inline">{m.product_share()}</span>
		</button>
	</div>

	<div
		class="grid w-full grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)_320px] lg:items-start"
	>
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

	<div
		class="grid w-full grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start"
	>
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

	<ProductDetailsTable {product} class="lg:hidden" />
</div>
