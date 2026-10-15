<script lang="ts">
	import { AllColumns } from '$lib/utils/constants/columns';
	import { formatValue } from '$lib/utils/format/format';
	import type { AvailabilityStore, PriceListItem } from '$lib/types';
	import type { SaleInfo } from '$lib/utils/catalog/sales';
	import { requestSettingsOpen } from '$lib/utils/app/settings';
	import { components } from '$lib/utils/ui/styles';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';
	import { storeName } from '$lib/utils/catalog/availability';
	import { m } from '$lib/i18n';

	const {
		product,
		sale,
		campaignWindow,
		preferredStore,
		availableInPreferredStore,
		closestAvailableStore,
		closestAvailableDistance,
		class: _class = ''
	}: {
		product: PriceListItem;
		sale: SaleInfo | null;
		campaignWindow: string | null;
		preferredStore?: AvailabilityStore;
		availableInPreferredStore: boolean;
		closestAvailableStore?: AvailabilityStore;
		closestAvailableDistance: string | null;
		class?: string;
	} = $props();

	function scrollToAvailability() {
		document.getElementById('myymalasaatavuus')?.scrollIntoView({ behavior: 'smooth' });
	}
</script>

<div class={twMerge('flex flex-col gap-4', _class)}>
	<div class="flex flex-col gap-0.5">
		<div class="flex items-end gap-2">
			<p
				class="text-[38px] leading-none font-bold"
				data-price={formatValue(product[AllColumns.Price], AllColumns.Price)}
			>
				{formatValue(product[AllColumns.Price], AllColumns.Price)}
			</p>
			{#if sale}
				<span class="text-lg text-secondary line-through">
					{formatValue(sale.normalPrice, AllColumns.NormalPrice)}
				</span>
			{/if}
		</div>
		<span class="mt-1 text-sm text-secondary">
			{formatValue(product[AllColumns.PricePerLiter], AllColumns.PricePerLiter)} · {formatValue(
				product[AllColumns.BottleSize],
				AllColumns.BottleSize
			)}
		</span>
		{#if sale}
			<p class="mt-1 text-sm font-bold text-red-700 dark:text-red-400">
				{campaignWindow
					? m.product_sale_with_window({ percent: sale.discountPercent, window: campaignWindow })
					: m.product_sale({ percent: sale.discountPercent })}
			</p>
		{/if}
	</div>

	{#if preferredStore}
		<div class="flex flex-col gap-2.5 rounded border border-primary bg-primary p-3">
			<div class="flex items-start gap-2.5">
				<Icon
					name={availableInPreferredStore ? 'check_circle' : 'x_circle'}
					class={availableInPreferredStore
						? 'text-green-700 dark:text-green-400'
						: 'text-red-700 dark:text-red-400'}
				/>
				<div class="flex min-w-0 flex-col gap-0.5">
					<span
						class={availableInPreferredStore
							? 'text-sm text-green-700 dark:text-green-400'
							: 'text-sm text-red-700 dark:text-red-400'}
					>
						{availableInPreferredStore
							? m.product_available_in_store()
							: m.product_not_available_in_store()}
					</span>
					<strong class="text-sm">{storeName(preferredStore)}</strong>
					{#if !availableInPreferredStore && closestAvailableStore}
						<span class="text-sm text-secondary">
							{m.product_closest_available()}
							{storeName(closestAvailableStore)}{closestAvailableDistance
								? ` (${closestAvailableDistance})`
								: ''}
						</span>
					{:else if !availableInPreferredStore}
						<span class="text-sm text-secondary">{m.product_not_available_elsewhere()}</span>
					{/if}
				</div>
				<button
					type="button"
					class="ml-auto shrink-0 border-0 bg-transparent p-0 text-sm text-secondary underline"
					onclick={requestSettingsOpen}
				>
					{m.product_change_store()}
				</button>
			</div>
			{#if !availableInPreferredStore && closestAvailableStore}
				<button
					type="button"
					class={twMerge(
						components.button({ size: 'sm' }),
						'flex w-full items-center justify-center gap-2'
					)}
					onclick={scrollToAvailability}
				>
					<span>{m.product_see_other_stores()}</span>
					<Icon name="chevron_down" />
				</button>
			{/if}
		</div>
	{:else}
		<button
			type="button"
			class={twMerge(
				components.button({ size: 'sm' }),
				'flex w-full items-center gap-2.5 border-dashed bg-primary text-left text-sm text-secondary'
			)}
			onclick={requestSettingsOpen}
		>
			<Icon name="store" class="text-xl" />
			<span>{m.product_choose_store()}</span>
		</button>
	{/if}
</div>
