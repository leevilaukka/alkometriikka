<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		readProductWineReviews,
		selectWineReview,
		type WineReview
	} from '$lib/utils/wine-reviews';
	import WineReviewCard from './WineReviewCard.svelte';

	let { sku, vintage }: { sku: string; vintage: unknown } = $props();
	let reviews = $state<WineReview[]>([]);
	const review = $derived(selectWineReview(reviews, vintage));

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
	<WineReviewCard {review} {vintage} />
{/if}
