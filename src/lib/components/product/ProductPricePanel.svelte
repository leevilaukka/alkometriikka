<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import type { AvailabilityStore, ListObj, PriceListItem } from '$lib/types';
	import type { SaleInfo } from '$lib/utils/sales';
	import type { SizeOption } from '$lib/utils/filters';
	import { addToList } from '$lib/utils/lists';
	import { components } from '$lib/utils/styles';
	import { compareProductIds } from '$lib/global.svelte';
	import { toggleCompare, MAX_COMPARE_PRODUCTS } from '$lib/utils/compare';
	import Icon from '../widgets/Icon.svelte';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import ProductPriceStoreBanner from './ProductPriceStoreBanner.svelte';
	import ProductSizeHook from './ProductSizeHook.svelte';
	import { twMerge } from 'tailwind-merge';

	const {
		product,
		sale,
		campaignWindow,
		preferredStore,
		availableInPreferredStore,
		closestAvailableStore,
		closestAvailableDistance,
		cheapestSize,
		class: _class = ''
	}: {
		product: PriceListItem;
		sale: SaleInfo | null;
		campaignWindow: string | null;
		preferredStore?: AvailabilityStore;
		availableInPreferredStore: boolean;
		closestAvailableStore?: AvailabilityStore;
		closestAvailableDistance: string | null;
		cheapestSize?: SizeOption;
		class?: string;
	} = $props();

	const inCompare = $derived(compareProductIds.includes(product[AllColumns.Number]));

	function handleToggleCompare() {
		if (!toggleCompare(product[AllColumns.Number])) {
			alert(`Voit vertailla korkeintaan ${MAX_COMPARE_PRODUCTS} tuotetta kerrallaan.`);
		}
	}
</script>

<aside class={twMerge('flex w-full flex-col gap-4 rounded border border-primary bg-secondary p-4', _class)}>
	<ProductPriceStoreBanner
		{product}
		{sale}
		{campaignWindow}
		{preferredStore}
		{availableInPreferredStore}
		{closestAvailableStore}
		{closestAvailableDistance}
	/>

	<div class="flex w-full flex-row gap-2">
		<Popup class="gap-4 p-4">
			{#snippet renderButton(dialogElement: HTMLDialogElement)}
				<button
					type="button"
					class={twMerge(components.button({ size: 'lg' }), 'w-full flex-1 justify-between px-4 py-2.5')}
					onclick={() => dialogElement.showModal()}
				>
					<span>Lisää listaan</span>
					<Icon name="plus" />
				</button>
			{/snippet}
			{#snippet renderContent(dialogElement: HTMLDialogElement)}
				<h2 class="text-xl">Valitse lista</h2>
				<AllLists
					action={(list: ListObj) => {
						addToList(list, product[AllColumns.Number]);
						dialogElement.close();
					}}
				/>
			{/snippet}
		</Popup>
		<button
			type="button"
			onclick={handleToggleCompare}
			class={twMerge(
				components.button({ size: 'lg', type: inCompare ? 'positive' : 'primary' }),
				'flex-1 justify-between px-4 py-2.5'
			)}
		>
			<span>{inCompare ? 'Vertailussa' : 'Vertaile'}</span>
			<Icon name="compare" />
		</button>
	</div>

	{#if cheapestSize && !cheapestSize.isCurrent}
		<ProductSizeHook size={cheapestSize} />
	{/if}

	<a
		href={`https://www.alko.fi/tuotteet/${product[AllColumns.Number]}`}
		target="_blank"
		rel="noopener noreferrer"
		referrerpolicy="no-referrer"
		class={twMerge(
			components.button({ size: 'lg' }),
			'w-full px-4 py-2.5',
			product[AllColumns.RemovedFromSelection] ? 'pointer-events-none opacity-50' : ''
		)}
	>
		<span>{product[AllColumns.RemovedFromSelection] ? 'Poistunut valikoimasta' : 'Alkon tuotesivu'}</span>
		{#if !product[AllColumns.RemovedFromSelection]}
			<Icon name="link_external" />
		{/if}
	</a>

	<p class="text-xs text-secondary text-wrap-pretty">
		Alkometriikka ei myy alkoholia. Tiedot päivittyvät Alkon hinnastosta.
	</p>
</aside>
