<script lang="ts">
	import type { PriceListItem } from '$lib/types';
	import { sendAnalyticsEvent } from '$lib/utils/helpers';
	import { recentPriceChanges } from '$lib/utils/metrics';
	import { isPriceDrop, priceChangeSince, priceChangesURL } from '$lib/utils/priceChanges';
	import Icon from '../widgets/Icon.svelte';
	import PriceChangeList from '../widgets/PriceChangeList.svelte';
	import CategorySection from './CategorySection.svelte';

	const {
		products,
		typeSlug,
		subTypeSlug,
		feedHref,
		open = false
	}: {
		products: PriceListItem[];
		typeSlug: string;
		subTypeSlug?: string;
		feedHref: string;
		open?: boolean;
	} = $props();

	const WINDOW_DAYS = 30;

	const since = priceChangeSince(WINDOW_DAYS);
	const changes = $derived(recentPriceChanges(products, since));
	const drops = $derived(changes.filter(isPriceDrop).length);
	// The same window on the price changes page, narrowed to this category
	const pageHref = $derived(priceChangesURL({ days: WINDOW_DAYS, direction: 'all', typeSlug, subTypeSlug }));
</script>

<CategorySection
	title={`Hinnanmuutokset (${WINDOW_DAYS} pv)`}
	hint={changes.length ? changes.length.toLocaleString('fi-FI') : undefined}
	{open}
>
	{#if changes.length === 0}
		<p class="text-sm text-secondary">Ei hinnanmuutoksia viimeisen {WINDOW_DAYS} päivän aikana.</p>
	{:else}
		<p class="text-xs text-secondary">
			{changes.length} tuotetta, joista {drops} halpeni
		</p>
		<!-- Roughly five rows tall, the rest scrolls -->
		<PriceChangeList {changes} class="max-h-72 overflow-y-auto overscroll-contain" />
	{/if}
	<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
		{#if changes.length > 0}
			<a href={pageHref} class="group flex items-center gap-1">
				<span class="group-hover:underline">Kaikki kategorian hinnanmuutokset</span>
				<Icon name="chevron_right" />
			</a>
		{/if}
		<a
			href={feedHref}
			onclick={() => sendAnalyticsEvent('click_feed', { feed: 'category', location: 'category_page' })}
			class="group flex items-center gap-1 text-secondary"
			title="Tilaa kategorian uutuudet ja hinnanmuutokset RSS-syötteenä"
		>
			<Icon name="rss" />
			<span class="group-hover:underline">RSS</span>
		</a>
	</div>
</CategorySection>
