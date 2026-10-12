<script lang="ts">
	import { resolve } from '$app/paths';
	import { reviewVintage, wineReviewUrl, type WineReview } from '$lib/utils/wine-reviews';
	import { components } from '$lib/utils/styles';
	import Icon from './Icon.svelte';

	let {
		review,
		vintage,
		heading = 'Viinilehden arvio',
		headingId = 'wine-review-heading',
		showProductLink = false
	}: {
		review: WineReview;
		vintage?: unknown;
		heading?: string;
		headingId?: string;
		showProductLink?: boolean;
	} = $props();
	const currentVintage = $derived(reviewVintage(vintage));
	const differentVintage = $derived(
		review.vintage && currentVintage && review.vintage !== currentVintage
	);
</script>

<section aria-labelledby={headingId} class="flex w-full flex-col gap-4 rounded border border-primary bg-secondary p-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="flex min-w-0 flex-col gap-1">
			<h2 id={headingId} class="text-xl font-bold">{heading}</h2>
			{#if heading !== review.title}<p class="text-sm text-secondary">{review.title}</p>{/if}
			{#if showProductLink}
				<a href={`${resolve('/')}tuotteet/${review.sku}/`} class="w-fit text-sm font-semibold text-brand-3 hover:underline dark:text-red-400">
					Tuotesivu · Alko {review.sku}
				</a>
			{/if}
			{#if review.publishedAt}
				<time datetime={review.publishedAt} class="text-sm text-secondary">
					{new Date(`${review.publishedAt}T12:00:00`).toLocaleDateString('fi-FI')}
				</time>
			{/if}
		</div>
		{#if review.stars !== null}
			<div class="flex flex-col gap-1 sm:items-end">
				<span aria-label={`${review.stars} / 5 tähteä`} class="text-2xl text-amber-600 dark:text-amber-400">
					<span aria-hidden="true">{'★'.repeat(review.stars)}{'☆'.repeat(5 - review.stars)}</span>
				</span>
				{#if review.starDescription}<p class="text-sm">{review.starDescription}</p>{/if}
			</div>
		{/if}
	</div>
	{#if differentVintage}
		<p class="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
			Arvio koskee vuosikertaa {review.vintage}. Alkon tuotteen vuosikerta on {currentVintage}.
		</p>
	{:else if review.vintage}
		<p class="text-sm text-secondary">Arvioitu vuosikerta: {review.vintage}</p>
	{/if}
	<p class="whitespace-pre-line leading-relaxed">{review.text}</p>
	{#if review.food}
		<div class="flex flex-col gap-1">
			<h3 class="font-bold">Ruokasuositus</h3>
			<p class="whitespace-pre-line leading-relaxed">{review.food}</p>
		</div>
	{/if}
	{#if review.storageDescription || review.valueDescription}
		<div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
			{#if review.storageDescription}<p><strong>Juotavuus:</strong> {review.storageDescription}</p>{/if}
			{#if review.valueDescription}<p><strong>Hinta-laatusuhde:</strong> {review.valueDescription}</p>{/if}
		</div>
	{/if}
	<a href={wineReviewUrl(review.slug)} target="_blank" rel="noopener noreferrer" class={components.button()}>
		<span>Lue viinilehdessä</span>
		<span aria-hidden="true"><Icon name="link_external" /></span>
	</a>
</section>
