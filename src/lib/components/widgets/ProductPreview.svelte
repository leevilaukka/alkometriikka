<script lang="ts">
	import { AllColumns, filterToUnitMarker } from "$lib/utils/constants";
	import { formatValue, headerToDisplayName, valueToString } from "$lib/utils/helpers";
	import { twMerge } from "tailwind-merge";
	import BadgeList from "./BadgeList.svelte";
    import ProductImage from "./ProductImage.svelte";
	import Icon from "./Icon.svelte";

    let { product, highlight = null, kaljakori, renderExtras, quantity = 1 } = $props();
</script>


<div
    class={twMerge(
        'relative flex flex-col overflow-clip rounded border border-gray-200 bg-white'
    )}
>
    <div
        class={twMerge('flex flex-col flex-nowrap items-center gap-4 p-4 md:flex-row')}
    >
        <div class="flex aspect-square w-40 max-w-[10rem] md:h-full md:w-auto md:max-w-fit shrink-0 p-2 bg-white rounded">
            <ProductImage
                number={product[AllColumns.Number]}
                name={product[AllColumns.Name]}
            />
        </div>
        <div class="flex w-full flex-col gap-2">
            <div class="flex flex-row items-center gap-3">
                <a href={`/tuotteet/${product[AllColumns.Number]}`} class="hover:underline">
                    <h2 class="text-xl font-bold md:text-2xl">
                        {product[AllColumns.Name]} ({formatValue(
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
                            ? `- ${formatValue(product[AllColumns.BeerType], AllColumns.BeerType)}`
                            : null}
                    </p>
                    <p>{valueToString(product[AllColumns.SubType], AllColumns.SubType)}</p>
                </div>
                <div class="flex flex-col gap-0.5 md:gap-1">
                    <p>
                        {valueToString(
                            product[AllColumns.AlcoholPercentage],
                            AllColumns.AlcoholPercentage
                        )}
                    </p>
                    <p>
                        {valueToString(
                            product[AllColumns.AlcoholGramsPerEuro],
                            AllColumns.AlcoholGramsPerEuro
                        )}
                    </p>
                    <p>
                        {valueToString(
                            product[AllColumns.EstimatedPromille],
                            AllColumns.EstimatedPromille
                        )}
                    </p>
                </div>
            </div>
            <div class="flex items-center gap-2 text-sm text-gray-500">
                <Icon name="map_pin" />
                <span class="text-sm">
                    {product[AllColumns.Country]}
                    {product[AllColumns.Region] ? ` - ${product[AllColumns.Region]}` : null}
                </span>
            </div>
            <div class="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div class="flex items-center gap-2">
                    <p class="text-3xl font-bold drop-shadow-lg">
                        {(
                            product[AllColumns.Price] *
                            quantity
                        ).toFixed(2)} €
                    </p>
                    {#if quantity > 1}
                        <span class="text-sm text-gray-500">
                            @ {product[AllColumns.Price]} € / kpl
                        </span>
                    {/if}
                    <span class="text-sm text-gray-500">
                        ({product[AllColumns.PricePerLiter]} €/L)
                    </span>
                </div>
                <div class="flex flex-row items-center gap-3">
                    <BadgeList item={product} />
                </div>
                {#if renderExtras}
                    <div class="flex flex-row gap-3 ms-auto">
                        {@render renderExtras()}
                    </div>
                {/if}
            </div>
        </div>
    </div>
    {#if highlight}
        {@const [_, max] = kaljakori.getMinAndMaxValues(highlight) as number[]}
        {@const multiplier = Number(product[highlight]) / max}
        {@const ratings = ['Matala', 'Kohtalainen', 'Korkea']}
        {@const rating = ratings[Number(((ratings.length - 1) * multiplier).toFixed(0))]}
        <div class="relative block max-w-full">
            <div
                class="relative flex h-full w-fit shrink-0 flex-nowrap items-center gap-1 bg-black px-1.5 py-0.5 text-sm whitespace-nowrap text-white"
                style={`left: ${100 * multiplier}%; transform: translateX(-${100 * multiplier}%);`}
            >
                <p>
                    {headerToDisplayName(highlight)}: {product[highlight]}
                    {filterToUnitMarker[highlight as keyof typeof filterToUnitMarker]}
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