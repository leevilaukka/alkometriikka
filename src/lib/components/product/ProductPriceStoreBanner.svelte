<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import type { AvailabilityStore, PriceListItem } from '$lib/types';
	import type { SaleInfo } from '$lib/utils/sales';
	import { requestSettingsOpen } from '$lib/utils/settings';
	import { components } from '$lib/utils/styles';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';

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
			<p class="text-[38px] leading-none font-bold" data-price={formatValue(product[AllColumns.Price], AllColumns.Price)}>
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
				Alennus {sale.discountPercent} %{campaignWindow ? ` · voimassa ${campaignWindow}` : ''}
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
						{availableInPreferredStore ? 'Saatavilla valitusta myymälästä' : 'Ei saatavilla valitusta myymälästä'}
					</span>
					<strong class="text-sm">{preferredStore.name}</strong>
					{#if !availableInPreferredStore && closestAvailableStore}
						<span class="text-sm text-secondary">
							Lähin saatavilla: {closestAvailableStore.name}{closestAvailableDistance
								? ` (${closestAvailableDistance})`
								: ''}
						</span>
					{/if}
				</div>
				<button
					type="button"
					class="ml-auto shrink-0 border-0 bg-transparent p-0 text-sm text-secondary underline"
					onclick={requestSettingsOpen}
				>
					Vaihda
				</button>
			</div>
			{#if !availableInPreferredStore}
				<button
					type="button"
					class={twMerge(components.button({ size: 'sm' }), 'flex w-full items-center justify-center gap-2')}
					onclick={scrollToAvailability}
				>
					<span>Katso muut myymälät</span>
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
			<span>Valitse ensisijainen myymälä nähdäksesi saatavuuden</span>
		</button>
	{/if}
</div>
