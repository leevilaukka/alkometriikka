<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import type { ListObj, PriceListItem } from '$lib/types';
	import { addToList } from '$lib/utils/lists';
	import { components } from '$lib/utils/styles';
	import { compareProductIds } from '$lib/global.svelte';
	import { toggleCompare, MAX_COMPARE_PRODUCTS } from '$lib/utils/compare';
	import Icon from '../widgets/Icon.svelte';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import { twMerge } from 'tailwind-merge';
	import BottomBar from '../widgets/BottomBar.svelte';

	const { product, class: _class = '' }: { product: PriceListItem; class?: string } = $props();

	const inCompare = $derived(compareProductIds.includes(product[AllColumns.Number]));

	function handleToggleCompare() {
		if (!toggleCompare(product[AllColumns.Number])) {
			alert(`Voit vertailla korkeintaan ${MAX_COMPARE_PRODUCTS} tuotetta kerrallaan.`);
		}
	}
</script>

<BottomBar class={_class}>
	<div class="flex shrink-0 flex-col">
		<strong class="text-lg leading-tight">{formatValue(product[AllColumns.Price], AllColumns.Price)}</strong>
		<span class="text-xs text-secondary">
			{formatValue(product[AllColumns.BottleSize], AllColumns.BottleSize)} · {formatValue(
				product[AllColumns.PricePerLiter],
				AllColumns.PricePerLiter
			)}
		</span>
	</div>
	{#if !product[AllColumns.RemovedFromSelection]}
		<a
			href={`https://www.alko.fi/tuotteet/${product[AllColumns.Number]}`}
			target="_blank"
			rel="noopener noreferrer"
			referrerpolicy="no-referrer"
			class={twMerge(components.button({ size: 'lg' }), 'ml-auto h-11 aspect-square shrink-0')}
			aria-label="Alkon tuotesivu"
		>
			<Icon name="link_external" />
		</a>
	{:else}
		<span class="ml-auto"></span>
	{/if}
	<button
		type="button"
		onclick={handleToggleCompare}
		aria-label={inCompare ? 'Poista vertailusta' : 'Lisää vertailuun'}
		class={twMerge(components.button({ type: inCompare ? 'positive' : 'primary', size: 'lg' }), 'h-11 aspect-square shrink-0 sm:aspect-auto')}
	>
		<span class="hidden sm:inline">{inCompare ? 'Vertailussa' : 'Vertaile'}</span>
		<Icon name="compare" />
	</button>
	<Popup class="gap-4 p-4">
		{#snippet renderButton(dialogElement: HTMLDialogElement)}
			<button
				type="button"
				class={twMerge(components.button({ type: 'positive', size: 'lg' }), 'h-11 w-20 sm:w-full')}
				aria-label="Lisää listaan"
				onclick={() => dialogElement.showModal()}
			>
				<span class="hidden sm:inline">Lisää listaan</span>
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
</BottomBar>
