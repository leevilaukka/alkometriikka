<script lang="ts">
	import { productName } from '$lib/i18n/values';
	import { resolve } from '$app/paths';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { formatValue } from '$lib/utils/format/format';
	import { components } from '$lib/utils/ui/styles';
	import type { PriceListItem } from '$lib/types';
	import { compareProductIds } from '$lib/global.svelte';
	import {
		addToCompareWithReference,
		removeFromCompare,
		MAX_COMPARE_PRODUCTS
	} from '$lib/utils/user/compare';
	import ProductImage from '../widgets/ProductImage.svelte';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';
	import { m } from '$lib/i18n';

	const {
		product,
		candidates,
		loading = false,
		class: _class = ''
	}: {
		product: PriceListItem;
		candidates: PriceListItem[];
		/** The price list hasn't loaded, so the cards are a placeholder as tall as they will be */
		loading?: boolean;
		class?: string;
	} = $props();

	function handleToggleCompare(number: string) {
		if (compareProductIds.includes(number)) {
			removeFromCompare(number);
			return;
		}
		// Selecting a candidate to compare implicitly compares it against the
		// product currently being viewed, so that product goes in first - anchored
		// as the reference - and only if both fit.
		if (!addToCompareWithReference(product[AllColumns.Number], number)) {
			alert(m.compare_limit({ count: MAX_COMPARE_PRODUCTS }));
		}
	}

	function sideScroll(node: HTMLElement) {
		function handleScroll(event: WheelEvent) {
			if (event.deltaY == 0 || event.deltaX != 0) return;
			// Let the page scroll once the row can't scroll any further that way
			const maxScroll = node.scrollWidth - node.clientWidth;
			if (event.deltaY < 0 ? node.scrollLeft <= 0 : node.scrollLeft >= maxScroll - 1) return;
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

{#if loading || candidates.length > 0}
	<section class={twMerge('flex flex-col gap-3.5', loading && 'h-133 md:h-125', _class)}>
		<div class="flex flex-wrap items-center justify-between gap-3.5">
			<h2 class="text-2xl font-bold">{m.similar_title()}</h2>
			<a
				href={resolve(`/vastaavat/${product[AllColumns.Number]}/`)}
				class={twMerge(components.button({ size: 'sm' }), 'flex items-center gap-2')}
			>
				<span>{m.similar_more()}</span>
				<Icon name="arrow_right" />
			</a>
		</div>

		{#if loading}
			<div aria-hidden="true" class="flex-1 animate-pulse rounded bg-secondary"></div>
		{:else}
			<div class="flex max-w-full flex-row flex-nowrap gap-3 overflow-x-auto" use:sideScroll>
				{#each candidates as similarProduct (similarProduct[AllColumns.Number])}
					{@const number = similarProduct[AllColumns.Number]}
					{@const inCompare = compareProductIds.includes(number)}
					<div class="flex w-48 shrink-0 flex-col gap-3 rounded-lg border border-primary p-4">
						<a href={resolve(`/tuotteet/${number}/`)} class="flex flex-col gap-3">
							<div class="flex h-30 flex-col gap-2 md:h-33">
								<h3 class="line-clamp-3 text-xl font-bold md:text-2xl">
									{productName(similarProduct)}
								</h3>
								<span>
									{formatValue(
										similarProduct[AllColumns.AlcoholPercentage],
										AllColumns.AlcoholPercentage
									)}
								</span>
							</div>
							<div class="flex aspect-square w-full shrink-0 rounded bg-white p-2 md:max-w-fit">
								<ProductImage
									number={similarProduct[AllColumns.Number]}
									name={productName(similarProduct)}
									alt={productName(similarProduct)}
									lazy
									class="block aspect-square h-full w-full object-contain"
								/>
							</div>
							<div class="flex flex-col gap-2">
								<p class="text-3xl font-bold drop-shadow-lg">
									{formatValue(similarProduct[AllColumns.Price], AllColumns.Price)}
								</p>
								<span class="text-sm text-secondary">
									{formatValue(similarProduct[AllColumns.BottleSize], AllColumns.BottleSize)} ({formatValue(
										similarProduct[AllColumns.PricePerLiter],
										AllColumns.PricePerLiter
									)})
								</span>
							</div>
						</a>
						<button
							type="button"
							aria-pressed={inCompare}
							aria-label={m.compare_product_label({ name: productName(similarProduct) })}
							class={twMerge(
								components.button({ size: 'sm', type: inCompare ? 'positive' : 'primary' }),
								'mt-auto w-full'
							)}
							onclick={() => handleToggleCompare(number)}
						>
							<Icon name="compare" />
							<span>{inCompare ? m.compare_in_compare() : m.compare_button()}</span>
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</section>
{/if}
