<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import { components } from '$lib/utils/styles';
	import type { PriceListItem } from '$lib/types';
	import {
		computeSimilarProductDeltas,
		groupSimilarProductsBySubType,
		similarProductSubType
	} from '$lib/utils/metrics';
	import ProductSimilarCard from './ProductSimilarCard.svelte';
	import ProductSimilarChips from './ProductSimilarChips.svelte';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';

	const {
		product,
		candidates,
		class: _class = ''
	}: { product: PriceListItem; candidates: PriceListItem[]; class?: string } = $props();

	let selectedChip: string | null = $state(null);

	const chips = $derived(groupSimilarProductsBySubType(candidates));
	const filteredCandidates = $derived(
		selectedChip ? candidates.filter((item) => similarProductSubType(item) === selectedChip) : candidates
	);
	const deltas = $derived(computeSimilarProductDeltas(product, filteredCandidates));

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
		<div class="flex flex-wrap items-end justify-between gap-3.5">
			<div class="flex flex-col gap-0.5">
				<h2 class="text-2xl font-bold">Vertaa samankaltaisiin</h2>
				<p class="text-sm text-secondary">
					Erot suhteessa tuotteeseen {product[AllColumns.Name]} · {formatValue(
						product[AllColumns.Price],
						AllColumns.Price
					)}
				</p>
			</div>
			<a
				href={`/vastaavat/${product[AllColumns.Number]}`}
				class={twMerge(components.button({ size: 'sm' }), 'flex items-center gap-2')}
			>
				<span>Lisää samankaltaisia</span>
				<Icon name="arrow_right" />
			</a>
		</div>

		{#if chips.length > 1}
			<ProductSimilarChips {chips} bind:selected={selectedChip} />
		{/if}

		{#if deltas.length > 0}
			<div class="-mx-4 flex flex-nowrap gap-3.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0" use:sideScroll>
				{#each deltas as delta (delta.product[AllColumns.Number])}
					<ProductSimilarCard reference={product} {delta} class="w-44 shrink-0" />
				{/each}
			</div>
		{:else}
			<p class="rounded-lg border border-dashed border-primary p-6 text-center text-secondary">
				Ei tuotteita tällä rajauksella.
			</p>
		{/if}
	</section>
{/if}
