<script lang="ts">
	import { AllColumns } from "$lib/utils/constants";
	import { headerToDisplayName } from "$lib/utils/helpers";
	import { formatValue } from "$lib/utils/format";
	import { getSaleInfo } from "$lib/utils/sales";
	import { components } from "$lib/utils/styles";
	import { compareProductIds } from "$lib/global.svelte";
	import { toggleCompare, MAX_COMPARE_PRODUCTS } from "$lib/utils/compare";
	import { twMerge } from "tailwind-merge";
	import BadgeList from "./BadgeList.svelte";
    import ProductImage from "./ProductImage.svelte";
	import Icon from "./Icon.svelte";

    let { product, highlight = null, kaljakori, renderExtras, quantity = 1, highlightMax = null } = $props();

    const sale = $derived(
        getSaleInfo({
            price: product[AllColumns.Price],
            normalPrice: product[AllColumns.NormalPrice],
            campaignStart: product[AllColumns.CampaignStart],
            campaignEnd: product[AllColumns.CampaignEnd]
        })
    );

    // e.g. "Oluet – Lager › Vaalea lager", skipping parts the product doesn't have
    const category = $derived(
        [
            [product[AllColumns.Type], product[AllColumns.Type] === 'Oluet' ? product[AllColumns.BeerType] : null]
                .filter(Boolean)
                .join(' – '),
            product[AllColumns.SubType]
        ]
            .filter(Boolean)
            .join(' › ')
    );

    const stats = $derived([
        { label: 'Alkoholi', value: formatValue(product[AllColumns.AlcoholPercentage], AllColumns.AlcoholPercentage) },
        // g/€ has no unit marker of its own
        { label: 'Per €', value: `${formatValue(product[AllColumns.AlcoholGramsPerEuro], AllColumns.AlcoholGramsPerEuro)} g` },
        { label: 'Promillet', value: formatValue(product[AllColumns.EstimatedPromille], AllColumns.EstimatedPromille) }
    ]);

    const inCompare = $derived(compareProductIds.includes(product[AllColumns.Number]));

    function handleToggleCompare() {
        if (!toggleCompare(product[AllColumns.Number])) {
            alert(`Voit vertailla korkeintaan ${MAX_COMPARE_PRODUCTS} tuotetta kerrallaan.`);
        }
    }
</script>


<div
    class={twMerge(
        'relative flex flex-col overflow-clip rounded border border-primary bg-primary'
    )}
>
    <!-- Price and actions get their own column from md up; on phones they span under the image and details -->
    <div
        class="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-4 p-4 sm:grid-cols-[10rem_minmax(0,1fr)] md:grid-cols-[9rem_minmax(0,1fr)_auto] md:gap-x-5 md:p-5"
    >
        <a
            href={`/tuotteet/${product[AllColumns.Number]}/`}
            tabindex="-1"
            aria-hidden="true"
            class="flex min-h-32 w-full self-stretch p-2 bg-white rounded"
        >
            <ProductImage
                number={product[AllColumns.Number]}
                name={product[AllColumns.Name]}
            />
        </a>
        <div class="flex min-w-0 flex-col gap-3">
            <div class="flex flex-col gap-1.5">
                <a href={`/tuotteet/${product[AllColumns.Number]}/`} class="hover:underline">
                    <h2 class="text-xl font-bold md:text-2xl">
                        {product[AllColumns.Name]}
                        <span class="whitespace-nowrap">({formatValue(product[AllColumns.BottleSize], AllColumns.BottleSize)})</span>
                    </h2>
                </a>
                <p class="text-base">
                    {product[AllColumns.Manufacturer]}
                    {#if category}<span class="text-secondary"> · {category}</span>{/if}
                </p>
                <div class="flex items-center gap-1.5 text-base text-secondary">
                    <Icon name="map_pin" />
                    <span>
                        {product[AllColumns.Country]}
                        {product[AllColumns.Region] ? ` - ${product[AllColumns.Region]}` : null}
                    </span>
                </div>
            </div>
            <!-- Badges sit beside the stats when there's room and wrap under them when there isn't -->
            <div class="flex flex-wrap items-center gap-2">
                <!-- Same bordered cells as the product page's quick stats, just smaller -->
                <dl class="grid w-fit max-w-full grid-cols-3 overflow-hidden rounded border border-primary">
                    {#each stats as stat, index (stat.label)}
                        <div class={twMerge('flex min-w-0 flex-col px-2.5 py-1', index > 0 && 'border-l border-primary')}>
                            <dt class="truncate text-xs text-secondary md:text-sm">{stat.label}</dt>
                            <dd class="text-sm font-bold whitespace-nowrap tabular-nums md:text-base">{stat.value}</dd>
                        </div>
                    {/each}
                </dl>
                <BadgeList item={product} />
            </div>
        </div>
        <div
            class="col-span-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 md:col-span-1 md:max-w-64 md:flex-col md:flex-nowrap md:items-end"
        >
            <div class="flex flex-col md:items-end">
                {#if sale}
                    <span class="text-sm text-secondary line-through">
                        {formatValue(sale.normalPrice * quantity, AllColumns.NormalPrice)}
                    </span>
                {/if}
                <p class="text-2xl leading-tight font-bold whitespace-nowrap md:text-3xl">
                    {formatValue(
                        product[AllColumns.Price] * quantity,
                        AllColumns.Price
                    )}
                </p>
                <span class="text-base whitespace-nowrap text-secondary">
                    {#if quantity > 1}
                        @ {formatValue(product[AllColumns.Price], AllColumns.Price)} / kpl
                    {/if}
                    ({formatValue(product[AllColumns.PricePerLiter], AllColumns.PricePerLiter)})
                </span>
            </div>
            <div class="flex flex-row flex-wrap items-center justify-end gap-2">
                <button
                    type="button"
                    onclick={handleToggleCompare}
                    class={twMerge(components.button({ type: inCompare ? 'positive' : 'primary' }))}
                >
                    <Icon name="compare" />
                    <span>{inCompare ? 'Vertailussa' : 'Vertaile'}</span>
                </button>
                {#if renderExtras}
                    {@render renderExtras()}
                {/if}
            </div>
        </div>
    </div>
    {#if highlight}
        {@const max = highlightMax ?? (kaljakori.getMinAndMaxValues(highlight) as number[])[1]}
        {@const multiplier = max > 0 ? Number(product[highlight]) / max : 0}
        {@const ratings = ['Matala', 'Kohtalainen', 'Korkea']}
        {@const rating = ratings[Number(((ratings.length - 1) * multiplier).toFixed(0))]}
        <div class="relative block max-w-full">
            <div
                class="relative flex h-full w-fit shrink-0 flex-nowrap items-center gap-1 bg-black px-1.5 py-px text-xs whitespace-nowrap text-white"
                style={`left: ${100 * multiplier}%; transform: translateX(-${100 * multiplier}%);`}
            >
                <p>
                    {headerToDisplayName(highlight)}: {formatValue(product[highlight], highlight)}
                </p>
                <span>- {rating}</span>
            </div>
            <div
                class="relative block h-2 w-full rounded-b bg-gradient-to-r from-brand-1 from-10% via-amber-400 to-green-500"
            >
                <div
                    class="absolute block h-full w-1 shrink-0 -translate-x-1/2 bg-black whitespace-nowrap"
                    style={`left: ${100 * multiplier}%; transform: translateX(${50 - 100 * multiplier}%);`}
                ></div>
            </div>
        </div>
    {/if}
</div>