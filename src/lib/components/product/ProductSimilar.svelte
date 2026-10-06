<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import { components } from '$lib/utils/styles';
	import type { PriceListItem } from '$lib/types';
	import { compareProductIds } from '$lib/global.svelte';
	import {
		addToCompareWithReference,
		removeFromCompare,
		MAX_COMPARE_PRODUCTS
	} from '$lib/utils/compare';
	import ProductImage from '../widgets/ProductImage.svelte';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';

	const {
		product,
		candidates,
		class: _class = ''
	}: { product: PriceListItem; candidates: PriceListItem[]; class?: string } = $props();

	function handleToggleCompare(number: string) {
		if (compareProductIds.includes(number)) {
			removeFromCompare(number);
			return;
		}
		// Selecting a candidate to compare implicitly compares it against the
		// product currently being viewed, so that product goes in first - anchored
		// as the reference - and only if both fit.
		if (!addToCompareWithReference(product[AllColumns.Number], number)) {
			alert(`Voit vertailla korkeintaan ${MAX_COMPARE_PRODUCTS} tuotetta kerrallaan.`);
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

{#if candidates.length > 0}
	<section class={twMerge('flex flex-col gap-3.5', _class)}>
		<div class="flex flex-wrap items-center justify-between gap-3.5">
			<h2 class="text-2xl font-bold">Samankaltaisia tuotteita</h2>
			<a
				href={`/vastaavat/${product[AllColumns.Number]}`}
				class={twMerge(components.button({ size: 'sm' }), 'flex items-center gap-2')}
			>
				<span>Lisää samankaltaisia</span>
				<Icon name="arrow_right" />
			</a>
		</div>

		<div class="flex max-w-full flex-row flex-nowrap gap-3 overflow-x-auto" use:sideScroll>
			{#each candidates as similarProduct (similarProduct[AllColumns.Number])}
				{@const number = similarProduct[AllColumns.Number]}
				{@const inCompare = compareProductIds.includes(number)}
				<div class="flex w-48 shrink-0 flex-col gap-3 rounded-lg border border-primary p-4">
					<a href={`/tuotteet/${number}/`} class="flex flex-col gap-3">
						<div class="flex h-30 flex-col gap-2 md:h-33">
							<h3 class="line-clamp-3 text-xl font-bold md:text-2xl">
								{similarProduct[AllColumns.Name]}
							</h3>
							<span>
								{formatValue(similarProduct[AllColumns.AlcoholPercentage], AllColumns.AlcoholPercentage)}
							</span>
						</div>
						<div class="flex aspect-square w-full shrink-0 rounded bg-white p-2 md:max-w-fit">
							<ProductImage
								number={similarProduct[AllColumns.Number]}
								name={similarProduct[AllColumns.Name]}
								alt={similarProduct[AllColumns.Name]}
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
						aria-label={`Vertaile: ${similarProduct[AllColumns.Name]}`}
						class={twMerge(components.button({ size: 'sm', type: inCompare ? 'positive' : 'primary' }), 'mt-auto w-full')}
						onclick={() => handleToggleCompare(number)}
					>
						<Icon name="compare" />
						<span>{inCompare ? 'Vertailussa' : 'Vertaile'}</span>
					</button>
				</div>
			{/each}
		</div>
	</section>
{/if}
