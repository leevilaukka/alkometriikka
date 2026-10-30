<script lang="ts">
	import { AllColumns, MissingValues } from '$lib/utils/constants/columns';
	import { formatValue } from '$lib/utils/format/format';
	import type { AvailabilityStore, LoadState, PriceListItem } from '$lib/types';
	import type { SaleInfo } from '$lib/utils/catalog/sales';
	import { components } from '$lib/utils/ui/styles';
	import Icon from '../widgets/Icon.svelte';
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
		class: _class = ''
	}: {
		product: PriceListItem;
		sale: SaleInfo | null;
		campaignWindow: string | null;
		/** The preferred store's availability: `loading` only while a chosen store's is on its way */
		storesState: LoadState;
		/** Availability has loaded and no store has the product, so choosing a store won't help */
		inNoStore: boolean;
		preferredStore?: AvailabilityStore;
		availableInPreferredStore: boolean;
		closestAvailableStore?: AvailabilityStore;
		closestAvailableDistance: string | null;
		class?: string;
	} = $props();

	const deposit = $derived(Number(product[AllColumns.Deposit]) || 0);
	const euroPerServing = $derived(Number(product[AllColumns.EuroPerServing]) || 0);
	const pricePerLiterCalculated = $derived(
		(product as { [MissingValues]?: Set<string> })[MissingValues]?.has(AllColumns.PricePerLiter) ??
			false
	);

	function scrollToAvailability() {
		document.getElementById('myymalasaatavuus')?.scrollIntoView({ behavior: 'smooth' });
	}

	function openStoreSearch() {
		scrollToAvailability();
		document.getElementById('myymalasaatavuus-haku')?.focus({ preventScroll: true });
	}
</script>

{#snippet soldNowhere(title: string, detail: string)}
	<div class="flex items-start gap-2.5 rounded border border-primary bg-primary p-3">
		<Icon name="x_circle" class="text-red-700 dark:text-red-400" />
		<div class="flex min-w-0 flex-col gap-0.5">
			<strong class="text-sm">{title}</strong>
			<span class="text-sm text-secondary">{detail}</span>
		</div>
	</div>
{/snippet}

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
			{#if euroPerServing > 0}
				<span title="Hinta yhtä 12 gramman alkoholiannosta kohden">
					<span class="font-medium text-black dark:text-zinc-200"
						>{formatValue(euroPerServing, AllColumns.EuroPerServing)}</span
					>/annos ·
				</span>
			{/if}
			<span
				title={pricePerLiterCalculated
					? 'Alko ei ole vielä julkaissut litrahintaa, joten se on laskettu hinnasta ja pullokoosta'
					: undefined}
			>
				{formatValue(
					product[AllColumns.PricePerLiter],
					AllColumns.PricePerLiter
				)}{pricePerLiterCalculated ? ' (laskettu)' : ''}
			</span>
			· {formatValue(product[AllColumns.BottleSize], AllColumns.BottleSize)}{deposit
				? ` · sis. pantin ${formatValue(deposit, AllColumns.Deposit)}`
				: ''}
		</span>
		{#if sale}
			<p class="mt-1 text-sm font-bold text-red-700 dark:text-red-400">
				Alennus {sale.discountPercent} %{campaignWindow ? ` · voimassa ${campaignWindow}` : ''}
			</p>
		{/if}
	</div>

	{#if product[AllColumns.RemovedFromSelection]}
		{@render soldNowhere(
			'Poistunut Alkon valikoimasta',
			'Tuotetta ei enää myydä Alkon myymälöissä.'
		)}
	{:else if storesState === 'failed'}
		<div
			class="flex min-h-17 items-center gap-2.5 rounded border border-primary bg-primary p-3 text-sm text-secondary"
		>
			<Icon name="alert_triangle" class="text-xl" />
			<span>Saatavuustietoja ei saatu ladattua</span>
		</div>
	{:else if storesState === 'loading'}
		<div
			class="flex min-h-17 animate-pulse items-center gap-2.5 rounded border border-primary bg-primary p-3 text-sm text-secondary"
		>
			<Icon name="store" class="text-xl" />
			<span>Haetaan saatavuutta…</span>
		</div>
	{:else if inNoStore}
		{@render soldNowhere(
			'Ei saatavilla myymälöistä',
			'Tuotetta ei ole tällä hetkellä yhdessäkään myymälässä.'
		)}
	{:else if preferredStore}
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
							? 'Saatavilla valitusta myymälästä'
							: 'Ei saatavilla valitusta myymälästä'}
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
					onclick={openStoreSearch}
				>
					Vaihda
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
			onclick={openStoreSearch}
		>
			<Icon name="store" class="text-xl" />
			<span>Valitse ensisijainen myymälä nähdäksesi saatavuuden</span>
		</button>
	{/if}
</div>
