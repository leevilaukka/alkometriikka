<script lang="ts">
	import { AllColumns } from '$lib/utils/constants/columns';
	import { formatValue } from '$lib/utils/format/format';
	import type { ListObj, PriceListItem } from '$lib/types';
	import { addToList } from '$lib/utils/user/lists';
	import { components } from '$lib/utils/ui/styles';
	import { compareProductIds } from '$lib/global.svelte';
	import { toggleCompare, MAX_COMPARE_PRODUCTS } from '$lib/utils/user/compare';
	import Icon from '../widgets/Icon.svelte';
	import Popup from '../widgets/Popup.svelte';
	import AllLists from '../widgets/AllLists.svelte';
	import { twMerge } from 'tailwind-merge';
	import BottomBar from '../widgets/BottomBar.svelte';
	import { alkoProductUrl } from '$lib/utils/app/alkoLinks';
	import { m } from '$lib/i18n';

	const { product, class: _class = '' }: { product: PriceListItem; class?: string } = $props();

	const inCompare = $derived(compareProductIds.includes(product[AllColumns.Number]));

	function handleToggleCompare() {
		if (!toggleCompare(product[AllColumns.Number])) {
			alert(m.compare_limit({ count: MAX_COMPARE_PRODUCTS }));
		}
	}
</script>

<BottomBar class={_class}>
	<div class="flex shrink-0 flex-col">
		<strong class="text-lg leading-tight"
			>{formatValue(product[AllColumns.Price], AllColumns.Price)}</strong
		>
		<span class="text-xs text-secondary">
			{formatValue(product[AllColumns.BottleSize], AllColumns.BottleSize)} · {formatValue(
				product[AllColumns.PricePerLiter],
				AllColumns.PricePerLiter
			)}
		</span>
	</div>
	{#if !product[AllColumns.RemovedFromSelection]}
		<a
			href={alkoProductUrl(product[AllColumns.Number])}
			target="_blank"
			rel="noopener noreferrer"
			referrerpolicy="no-referrer"
			class={twMerge(components.button({ size: 'lg' }), 'ml-auto aspect-square h-11 shrink-0')}
			aria-label={m.product_alko_page()}
		>
			<Icon name="link_external" />
		</a>
	{:else}
		<span class="ml-auto"></span>
	{/if}
	<button
		type="button"
		onclick={handleToggleCompare}
		aria-label={inCompare ? m.compare_remove() : m.compare_add()}
		class={twMerge(
			components.button({ type: inCompare ? 'positive' : 'primary', size: 'lg' }),
			'aspect-square h-11 shrink-0 sm:aspect-auto'
		)}
	>
		<span class="hidden sm:inline">{inCompare ? m.compare_in_compare() : m.compare_button()}</span>
		<Icon name="compare" />
	</button>
	<Popup class="gap-4 p-4">
		{#snippet renderButton(dialogElement: HTMLDialogElement)}
			<button
				type="button"
				class={twMerge(components.button({ type: 'positive', size: 'lg' }), 'h-11 w-20 sm:w-full')}
				aria-label={m.list_add_to()}
				onclick={() => dialogElement.showModal()}
			>
				<span class="hidden sm:inline">{m.list_add_to()}</span>
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
</BottomBar>
