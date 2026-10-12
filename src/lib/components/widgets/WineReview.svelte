<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		readProductWineReviews,
		reviewVintage,
		selectWineReview,
		wineReviewUrl,
		type WineReview
	} from '$lib/utils/wine-reviews';
	import Icon from './Icon.svelte';

	let { sku, vintage }: { sku: string; vintage: unknown } = $props();
	let reviews = $state<WineReview[]>([]);
	const review = $derived(selectWineReview(reviews, vintage));
	const currentVintage = $derived(reviewVintage(vintage));
	const differentVintage = $derived(
		review?.vintage && currentVintage && review.vintage !== currentVintage
	);

	$effect(() => {
		const currentSku = sku;
		reviews = [];
		if (!/^\d{6}$/.test(currentSku)) return;
		const controller = new AbortController();
		fetch(`${resolve('/')}reviews/${currentSku}.json`, { signal: controller.signal })
			.then(async (response) =>
				response.ok ? readProductWineReviews(await response.json(), currentSku) : []
			)
			.then((result) => {
				if (!controller.signal.aborted) reviews = result;
			})
			.catch(() => {
				// Reviews remain optional when offline or before the first sync.
			});
		return () => controller.abort();
	});
</script>

{#if review}
	<section aria-labelledby="wine-review-heading" class="flex w-full flex-col gap-4 rounded border border-primary bg-secondary p-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="flex flex-col gap-1">
				<h2 id="wine-review-heading" class="text-xl font-bold">Viinilehden arvio</h2>
				<p class="text-sm text-secondary">{review.title}</p>
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
		<a href={wineReviewUrl(review.slug)} target="_blank" rel="noopener noreferrer" class="flex w-fit items-center gap-2 font-semibold text-brand-3 hover:underline dark:text-red-400">
			<span>Lähde: Viinilehti — lue alkuperäinen arvio</span>
			<Icon name="link_external" />
		</a>
	</section>
{/if}
