<script lang="ts">
	import { resolve } from '$app/paths';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { headerToDisplayName, valueToString } from '$lib/utils/format/labels';
	import { formatValue } from '$lib/utils/format/format';
	import { getSaleInfo } from '$lib/utils/catalog/sales';
	import { components } from '$lib/utils/ui/styles';
	import { compareProductIds } from '$lib/global.svelte';
	import { toggleCompare, MAX_COMPARE_PRODUCTS } from '$lib/utils/user/compare';
	import { twMerge } from 'tailwind-merge';
	import BadgeList from './BadgeList.svelte';
	import ProductImage from './ProductImage.svelte';
	import Icon from './Icon.svelte';
	import { m } from '$lib/i18n';
	import { productName, translateValue } from '$lib/i18n/values';

	let {
		product,
		highlight = null,
		kaljakori,
		renderExtras,
		renderAside = undefined,
		quantity = 1,
		highlightMax = null
	} = $props();

	const sale = $derived(
		getSaleInfo({
			price: product[AllColumns.Price],
			normalPrice: product[AllColumns.NormalPrice],
			campaignStart: product[AllColumns.CampaignStart],
			campaignEnd: product[AllColumns.CampaignEnd]
		})
	);

	const inCompare = $derived(compareProductIds.includes(product[AllColumns.Number]));

	function handleToggleCompare() {
		if (!toggleCompare(product[AllColumns.Number])) {
			alert(m.compare_limit({ count: MAX_COMPARE_PRODUCTS }));
		}
	}
</script>

<div
	class={twMerge('relative flex flex-col overflow-clip rounded border border-primary bg-primary')}
>
	<!-- Pages can attach a tab to the card's left edge (its top on phones), e.g. the price change on /hinnanmuutokset -->
	<div class="flex flex-col md:flex-row">
		{#if renderAside}
			{@render renderAside()}
		{/if}
		<div
			class={twMerge('flex min-w-0 flex-1 flex-col flex-nowrap items-center gap-4 p-4 md:flex-row')}
		>
			<div
				class="flex aspect-square w-40 max-w-[10rem] shrink-0 rounded bg-white p-2 md:h-full md:w-auto md:max-w-fit"
			>
				<ProductImage number={product[AllColumns.Number]} name={productName(product)} />
			</div>
			<div class="flex w-full flex-col gap-2">
				<div class="flex flex-row items-center gap-3">
					<a href={resolve(`/tuotteet/${product[AllColumns.Number]}/`)} class="hover:underline">
						<h2 class="text-xl font-bold md:text-2xl">
							{productName(product)} ({formatValue(
								product[AllColumns.BottleSize],
								AllColumns.BottleSize
							)})
						</h2>
					</a>
				</div>
				<div class="flex flex-col items-start gap-0.5 md:flex-row md:gap-3">
					<div class="flex flex-col gap-0.5 md:gap-1">
						<p>{valueToString(product[AllColumns.Manufacturer], AllColumns.Manufacturer)}</p>
						<p>
							{valueToString(product[AllColumns.Type], AllColumns.Type)}
							{product[AllColumns.Type] === 'Oluet'
								? `- ${valueToString(product[AllColumns.BeerType], AllColumns.BeerType)}`
								: null}
						</p>
						<p>{valueToString(product[AllColumns.SubType], AllColumns.SubType)}</p>
					</div>
					<div class="flex flex-col gap-0.5 md:gap-1">
						<p>
							{valueToString(product[AllColumns.AlcoholPercentage], AllColumns.AlcoholPercentage)}
						</p>
						<p>
							{valueToString(
								product[AllColumns.AlcoholGramsPerEuro],
								AllColumns.AlcoholGramsPerEuro
							)}
						</p>
						<p>
							{valueToString(product[AllColumns.EstimatedPromille], AllColumns.EstimatedPromille)}
						</p>
					</div>
				</div>
				<div class="flex items-center gap-2 text-sm text-secondary">
					<Icon name="map_pin" />
					<span class="text-sm">
						{translateValue(product[AllColumns.Country], AllColumns.Country)}
						{product[AllColumns.Region]
							? ` - ${translateValue(product[AllColumns.Region], AllColumns.Region)}`
							: null}
					</span>
				</div>
				<div class="flex flex-col gap-4 lg:flex-row lg:items-center">
					<div class="flex items-center gap-2">
						{#if sale}
							<span class="text-xl text-secondary line-through">
								{formatValue(sale.normalPrice * quantity, AllColumns.NormalPrice)}
							</span>
						{/if}
						<p class="text-3xl font-bold drop-shadow-lg">
							{formatValue(product[AllColumns.Price] * quantity, AllColumns.Price)}
						</p>
						{#if quantity > 1}
							<span class="text-sm text-secondary">
								@ {formatValue(product[AllColumns.Price], AllColumns.Price)} / {m.unit_piece()}
							</span>
						{/if}
						<span class="text-sm text-secondary">
							({formatValue(product[AllColumns.PricePerLiter], AllColumns.PricePerLiter)})
						</span>
					</div>
					<div class="flex flex-row items-center gap-3">
						<BadgeList item={product} />
					</div>
					<div class="ms-auto flex flex-row flex-wrap items-center gap-3">
						<button
							type="button"
							onclick={handleToggleCompare}
							class={twMerge(components.button({ type: inCompare ? 'positive' : 'primary' }))}
						>
							<Icon name="compare" />
							<span>{inCompare ? m.compare_in_compare() : m.compare_button()}</span>
						</button>
						{#if renderExtras}
							{@render renderExtras()}
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
	{#if highlight}
		{@const max = highlightMax ?? (kaljakori.getMinAndMaxValues(highlight) as number[])[1]}
		{@const multiplier = max > 0 ? Number(product[highlight]) / max : 0}
		{@const ratings = [m.rating_low(), m.rating_moderate(), m.rating_high()]}
		{@const rating = ratings[Number(((ratings.length - 1) * multiplier).toFixed(0))]}
		<div class="relative block max-w-full">
			<div
				class="relative flex h-full w-fit shrink-0 flex-nowrap items-center gap-1 bg-black px-1.5 py-0.5 text-sm whitespace-nowrap text-white"
				style={`left: ${100 * multiplier}%; transform: translateX(-${100 * multiplier}%);`}
			>
				<p>
					{headerToDisplayName(highlight)}: {formatValue(product[highlight], highlight)}
				</p>
				<span>- {rating}</span>
			</div>
			<div
				class="relative block h-4 w-full rounded-b bg-gradient-to-r from-brand-1 from-10% via-amber-400 to-green-500"
			>
				<div
					class="absolute block h-full w-1 shrink-0 -translate-x-1/2 bg-black whitespace-nowrap"
					style={`left: ${100 * multiplier}%; transform: translateX(${50 - 100 * multiplier}%);`}
				></div>
			</div>
		</div>
	{/if}
</div>
