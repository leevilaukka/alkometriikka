<script lang="ts">
	import type { Kaljakori } from '$lib/alko';
	import type { PriceListItem } from '$lib/types';
	import { findProductCategoryTrail } from '$lib/utils/categories';
	import { AllColumns } from '$lib/utils/constants';
	import { formatRoundedPricePerLiter } from '$lib/utils/format';
	import { computeQualityMetrics } from '$lib/utils/metrics';
	import { twMerge } from 'tailwind-merge';
	import Icon from '../widgets/Icon.svelte';

	const {
		product,
		kaljakori,
		class: _class = ''
	}: { product: PriceListItem; kaljakori: Kaljakori; class?: string } = $props();

	const trail = $derived(
		findProductCategoryTrail(
			kaljakori.getCategoryTree(),
			product[AllColumns.Type],
			product[AllColumns.SubType]
		).trail
	);
	// Only products in a subcategory have a wider category to compare against
	const hasParentCategory = $derived(trail.length > 1);
	let compareToParent = $state(false);

	const result = $derived(
		computeQualityMetrics(product, kaljakori, {
			parentCategory: hasParentCategory && compareToParent
		})
	);

	// The category page of the compared products, for browsing them
	const categoryNode = $derived(hasParentCategory && compareToParent ? trail[0] : trail.at(-1));
</script>

{#snippet categoryLink(className: string)}
	{#if categoryNode}
		<a
			href={categoryNode.path}
			class={twMerge('group items-center gap-1 text-sm text-secondary', className)}
		>
			<span class="group-hover:underline">Selaa kategoriaa {categoryNode.name}</span>
			<Icon name="chevron_right" />
		</a>
	{/if}
{/snippet}

{#snippet categorySegment(label: string, selected: boolean, onclick: () => void)}
	<button
		type="button"
		aria-pressed={selected}
		{onclick}
		class={selected
			? 'font-semibold text-black dark:text-white'
			: 'cursor-pointer underline decoration-dotted underline-offset-2 hover:text-black dark:hover:text-white'}
	>
		{label}
	</button>
{/snippet}

{#if result.metrics.length > 0}
	<section class={twMerge('flex flex-col gap-3', _class)}>
		<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
			<h2 class="text-2xl font-bold">Hinta-laatu</h2>
			<span class="text-sm text-secondary">
				verrattuna muihin ryhmän
				{#if hasParentCategory}
					<span role="group" aria-label="Vertailuryhmä">
						{@render categorySegment(
							trail[1].name,
							!compareToParent,
							() => (compareToParent = false)
						)}
						/
						{@render categorySegment(
							trail[0].name,
							compareToParent,
							() => (compareToParent = true)
						)}
					</span>
				{:else}
					"{result.categoryLabel}"
				{/if}
				tuotteisiin <span class="whitespace-nowrap">(n = {result.sampleSize})</span>
			</span>
			<!-- Next to the heading on wider screens; phones have no room, so it goes below the cards -->
			{@render categoryLink('ml-auto hidden md:flex')}
		</div>
		<div class="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
			{#each result.metrics as metric (metric.key)}
				{@const showMedian =
					metric.key === AllColumns.PricePerLiter && result.medianPricePerLiter !== null}
				<div class="flex flex-col gap-2 rounded border border-primary bg-primary p-3.5">
					<span class="text-sm text-secondary">{metric.label}</span>
					<strong class="text-2xl leading-tight font-bold">{metric.value}</strong>
					<div class="h-1.5 overflow-hidden rounded-full bg-secondary">
						<div
							class="h-full rounded-full bg-brand-3"
							style={`width: ${metric.barPercent}%`}
						></div>
					</div>
					<span class="text-wrap-pretty text-sm text-secondary">
						{metric.note}{#if showMedian}. Mediaani {formatRoundedPricePerLiter(
								result.medianPricePerLiter as number
							)}{/if}
					</span>
				</div>
			{/each}
		</div>
		{@render categoryLink('flex self-end md:hidden')}
	</section>
{/if}
