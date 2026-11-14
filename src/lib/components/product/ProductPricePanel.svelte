<script lang="ts">
	import { AllColumns } from '$lib/utils/constants/columns';
	import type { AvailabilityStore, LoadState, PriceListItem } from '$lib/types';
	import type { SaleInfo } from '$lib/utils/catalog/sales';
	import { isStaleArrival } from '$lib/utils/catalog/status';
	import type { SizeOption } from '$lib/utils/catalog/filters';
	import { components } from '$lib/utils/ui/styles';
	import Icon from '../widgets/Icon.svelte';
	import AddToListButton from '../widgets/AddToListButton.svelte';
	import CompareButton from '../widgets/CompareButton.svelte';
	import ProductPriceStoreBanner from './ProductPriceStoreBanner.svelte';
	import ProductSizeHook from './ProductSizeHook.svelte';
	import { twMerge } from 'tailwind-merge';

	const {
		product,
		sale,
		campaignWindow,
		storesState,
		inNoStore,
		preferredStore,
		availableInPreferredStore,
		closestAvailableStore,
		closestAvailableDistance,
		storeCounts,
		liveLoading = false,
		cheapestSize,
		class: _class = ''
	}: {
		product: PriceListItem;
		sale: SaleInfo | null;
		campaignWindow: string | null;
		storesState: LoadState;
		inNoStore: boolean;
		preferredStore?: AvailabilityStore;
		availableInPreferredStore: boolean;
		closestAvailableStore?: AvailabilityStore;
		closestAvailableDistance: string | null;
		/** Store id → units, once the live counts are in */
		storeCounts?: Map<string, number>;
		/** The live counts are on their way */
		liveLoading?: boolean;
		cheapestSize?: SizeOption;
		class?: string;
	} = $props();
</script>

<aside
	class={twMerge(
		'flex w-full flex-col gap-4 rounded border border-primary bg-secondary p-4',
		_class
	)}
>
	<ProductPriceStoreBanner
		{product}
		{sale}
		{campaignWindow}
		{storesState}
		{inNoStore}
		{preferredStore}
		{availableInPreferredStore}
		{closestAvailableStore}
		{closestAvailableDistance}
		{storeCounts}
		{liveLoading}
	/>

	<div class="flex w-full flex-row gap-2">
		<AddToListButton
			productNumber={product[AllColumns.Number]}
			type="primary"
			size="lg"
			class="w-full flex-1 justify-between px-4 py-2.5"
		/>
		<CompareButton
			productNumber={product[AllColumns.Number]}
			size="lg"
			iconPosition="end"
			class="flex-1 justify-between px-4 py-2.5"
		/>
	</div>

	{#if cheapestSize && !cheapestSize.isCurrent}
		<ProductSizeHook size={cheapestSize} />
	{/if}

	{#if product[AllColumns.RemovedFromSelection] || isStaleArrival(product)}
		<!-- alko.fi has no page for these -->
		<span
			class={twMerge(
				components.button({ size: 'lg' }),
				'w-full cursor-default px-4 py-2.5 opacity-50'
			)}
		>
			{product[AllColumns.RemovedFromSelection] ? 'Poistunut valikoimasta' : 'Ei myynnissä'}
		</span>
	{:else}
		<a
			href={`https://www.alko.fi/tuotteet/${product[AllColumns.Number]}`}
			target="_blank"
			rel="noopener noreferrer"
			referrerpolicy="no-referrer"
			class={twMerge(components.button({ size: 'lg' }), 'w-full px-4 py-2.5')}
		>
			<span>Alkon tuotesivu</span>
			<Icon name="link_external" />
		</a>
	{/if}

	<p class="text-wrap-pretty text-xs text-secondary">
		Alkometriikka ei myy alkoholia. Tiedot päivittyvät Alkon hinnastosta.
	</p>
</aside>
