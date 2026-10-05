<script lang="ts">
	import type { PriceListItem } from '$lib/types';
	import { recentPriceChanges } from '$lib/utils/metrics';
	import { isPriceDrop, priceChangeSince } from '$lib/utils/priceChanges';
	import Icon from '../widgets/Icon.svelte';
	import PriceChangeList from '../widgets/PriceChangeList.svelte';

	const { products, feedHref }: { products: PriceListItem[]; feedHref: string } = $props();

	const WINDOW_DAYS = 30;

	const since = priceChangeSince(WINDOW_DAYS);
	const changes = $derived(recentPriceChanges(products, since));
	const drops = $derived(changes.filter(isPriceDrop).length);
</script>

<section class="flex flex-col gap-2">
	<div class="flex items-baseline justify-between gap-2">
		<h2 class="text-sm font-bold">Hinnanmuutokset ({WINDOW_DAYS} pv)</h2>
		<a
			href={feedHref}
			class="group flex items-center gap-1 text-xs text-secondary"
			title="Tilaa kategorian uutuudet ja hinnanmuutokset RSS-syötteenä"
		>
			<Icon name="rss" />
			<span class="group-hover:underline">RSS</span>
		</a>
	</div>
	{#if changes.length === 0}
		<p class="text-sm text-secondary">Ei hinnanmuutoksia viimeisen {WINDOW_DAYS} päivän aikana.</p>
	{:else}
		<p class="text-xs text-secondary">
			{changes.length} tuotetta, joista {drops} halpeni
		</p>
		<!-- Roughly five rows tall, the rest scrolls -->
		<PriceChangeList {changes} class="max-h-72 overflow-y-auto overscroll-contain" />
	{/if}
</section>
