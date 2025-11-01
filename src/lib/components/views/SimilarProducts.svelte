<script lang="ts">
	import { findSimilarProducts } from '$lib/utils/filters';
	import SvelteVirtualList from '@humanspeak/svelte-virtual-list';
	import ProductPreview from '../widgets/ProductPreview.svelte';
	import { twMerge } from 'tailwind-merge';
	import { goto } from '$app/navigation';
	import { AllColumns } from '$lib/utils/constants';
	import type { ListObj, PriceListItem } from '$lib/types';
	import { components } from '$lib/utils/styles';
	import { isMobile } from '$lib/global.svelte';
	import Icon from '../widgets/Icon.svelte';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import { addToList } from '$lib/utils/lists';
	import { valueToString } from '$lib/utils/helpers';
	import ProductImage from '../widgets/ProductImage.svelte';
	import BadgeList from '../widgets/BadgeList.svelte';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	let { product, kaljakori } = $props();

	let listRef: SvelteVirtualList<PriceListItem | null> | null = $state(null);
    let showScrollToTopButton = $state(false);

	let similarProducts = findSimilarProducts(
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
		kaljakori.data.length
	);

	function handleBack() {
		if (window.history.length > 1) window.history.back();
		else goto('/');
	}

    onMount(() => {
        const viewport = document.getElementById("virtual-list-viewport")
        viewport?.addEventListener("scroll", () => {
            if(viewport.scrollTop > 0) showScrollToTopButton = true;
            else showScrollToTopButton = false;
        })
    })
</script>

<div class={twMerge('mx-auto flex w-full max-w-[120ch] flex-auto flex-col flex-nowrap p-4 gap-4 md:p-6')}>
	<div class="flex w-full items-center justify-between gap-4">
		<button onclick={() => handleBack()} class={twMerge(components.button({ size: 'md' }))}>
			<Icon name={window.history.length > 1 ? 'arrow_back' : 'home'} class="inline-block" />
			<span>{window.history.length > 1 ? 'Takaisin' : 'Etusivulle'}</span>
		</button>
        {#if showScrollToTopButton}
            <button
                in:fade={{ duration: 200 }}
                out:fade={{ duration: 200 }}
                onclick={() => {
                    listRef?.scroll({ index: 0, smoothScroll: false });
                }}
                class={twMerge(components.button({ size: 'md' }))}
            >
                <Icon name={'arrow_to_top'} />
                <span>{$isMobile ? 'Alkuun' : 'Hyppää alkuun'}</span>
            </button>
        {/if}
	</div>
	<div class="flex max-h-full flex-auto flex-col overflow-hidden">
		<SvelteVirtualList
			items={[null, ...similarProducts]}
			bind:this={listRef}
			itemsClass={'relative flex flex-col gap-3'}
		>
			{#snippet renderItem(item, idx: number)}
				{#if idx === 0}
                    <div class="flex w-full flex-col gap-3">
                        <div class="grid w-full grid-cols-1 md:grid-cols-[auto_1fr]">
                            <div class="flex aspect-square h-56 w-full max-w-full p-6 md:w-fit">
                                <ProductImage
                                    number={product[AllColumns.Number]}
                                    name={product[AllColumns.Name]}
                                    transform="medium"
                                    alt={product[AllColumns.Name]}
                                />
                            </div>
                            <div class="flex w-full flex-col justify-between gap-3">
                                <div class="flex flex-col gap-2">
                                    <h2 class="text-lg font-bold md:text-xl">Samankaltaisia tuotteita kuin:</h2>
                                    <h1 class="text-2xl font-bold md:text-3xl">
                                        {product[AllColumns.Name]}
                                    </h1>
                                    <span>
                                        {valueToString(product[AllColumns.Manufacturer], AllColumns.Manufacturer)} | {valueToString(
                                            product[AllColumns.BottleSize],
                                            AllColumns.BottleSize
                                        )} | {valueToString(
                                            product[AllColumns.AlcoholPercentage],
                                            AllColumns.AlcoholPercentage
                                        )}
                                        {product[AllColumns.Vintage] !== ''
                                            ? `| ${valueToString(product[AllColumns.Vintage], AllColumns.Vintage)}`
                                            : ''}</span
                                    >
                                    <p class="w-fit rounded bg-gray-200 px-1">{product[AllColumns.Availability]}</p>
                                    <div class="flex w-full flex-row gap-2 md:flex-row">
                                        <BadgeList item={product} />
                                    </div>
                                </div>
                                <div class="flex flex-col items-end gap-1">
                                    <p class="text-4xl font-bold">
                                        {product[AllColumns.Price].toFixed(2)} €
                                    </p>
                                    <span class="text-sm text-gray-500">
                                        ({product[AllColumns.PricePerLiter]} €/L)
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                            <hr class="border-gray-300">
                            <span class="text-sm text-gray-500">Vastaavin ensin</span>
                            <hr class="border-gray-300">
                        </div>
                    </div>
				{:else}
					<ProductPreview product={item} {kaljakori}>
						{#snippet renderExtras()}
							<div
								class="absolute top-0 left-0 flex flex-nowrap items-center gap-0.5 rounded-br bg-gray-100 px-1.5 py-0.5 text-sm text-gray-500"
							>
								<Icon name="hashtag" />
								<span>{`${idx}`}</span>
							</div>
							<Popup class="gap-4 p-4">
								{#snippet renderButton(dialogElement: HTMLDialogElement)}
									<button
										class={twMerge(components.button({ type: 'positive' }), 'ml-auto')}
										onclick={() => dialogElement.showModal()}
									>
										<span>Lisää listaan</span>
										<Icon name="plus" />
									</button>
								{/snippet}
								{#snippet renderContent(dialogElement: HTMLDialogElement)}
									<h2 class="text-xl">Valitse lista</h2>
									<AllLists
										action={(list: ListObj) => {
											addToList(list, item[AllColumns.Number]);
											dialogElement.close();
										}}
									/>
								{/snippet}
							</Popup>
						{/snippet}
					</ProductPreview>
				{/if}
			{/snippet}
		</SvelteVirtualList>
	</div>
</div>
