<script lang="ts">
	import { AllColumns } from '$lib/utils/constants/columns';
	import type { AvailabilityStore, ListObj, PriceListItem } from '$lib/types';
	import type { SaleInfo } from '$lib/utils/catalog/sales';
	import type { SizeOption } from '$lib/utils/catalog/filters';
	import { addToList } from '$lib/utils/user/lists';
	import { components } from '$lib/utils/ui/styles';
	import { compareProductIds } from '$lib/global.svelte';
	import { toggleCompare, MAX_COMPARE_PRODUCTS } from '$lib/utils/user/compare';
	import Icon from '../widgets/Icon.svelte';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import ProductPriceStoreBanner from './ProductPriceStoreBanner.svelte';
	import ProductSizeHook from './ProductSizeHook.svelte';
	import { twMerge } from 'tailwind-merge';
	import { alkoProductUrl } from '$lib/utils/app/alkoLinks';
	import { m } from '$lib/i18n';

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
			alert(m.compare_limit({ count: MAX_COMPARE_PRODUCTS }));
		}
	}
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
					class={twMerge(
						components.button({ size: 'lg' }),
						'w-full flex-1 justify-between px-4 py-2.5'
					)}
					onclick={() => dialogElement.showModal()}
				>
					<span>{m.list_add_to()}</span>
					<Icon name="plus" />
				</button>
			{/snippet}
			{#snippet renderContent(dialogElement: HTMLDialogElement)}
				<h2 class="text-xl">{m.list_choose()}</h2>
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
			<span>{inCompare ? m.compare_in_compare() : m.compare_button()}</span>
			<Icon name="compare" />
		</button>
	</div>

	{#if cheapestSize && !cheapestSize.isCurrent}
		<ProductSizeHook size={cheapestSize} />
	{/if}

	{#if product[AllColumns.RemovedFromSelection]}
		<span
			class={twMerge(
				components.button({ size: 'lg' }),
				'w-full cursor-default px-4 py-2.5 opacity-50'
			)}
		>
			{m.column_removed_from_selection()}
		</span>
	{:else}
		<a
			href={alkoProductUrl(product[AllColumns.Number])}
			target="_blank"
			rel="noopener noreferrer"
			referrerpolicy="no-referrer"
			class={twMerge(components.button({ size: 'lg' }), 'w-full px-4 py-2.5')}
		>
			<span>{m.product_alko_page()}</span>
			<Icon name="link_external" />
		</a>
	{/if}

	<p class="text-wrap-pretty text-xs text-secondary">
		{m.product_disclaimer()}
	</p>
</aside>
