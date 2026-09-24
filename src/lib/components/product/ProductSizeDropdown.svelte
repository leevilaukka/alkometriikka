<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import { sendAnalyticsEvent } from '$lib/utils/helpers';
	import type { PriceListItem } from '$lib/types';
	import type { SizeOption } from '$lib/utils/filters';
	import Icon from '../widgets/Icon.svelte';
	import { twMerge } from 'tailwind-merge';

	const {
		product,
		sizes,
		class: _class = ''
	}: { product: PriceListItem; sizes: SizeOption[]; class?: string } = $props();

	const current = $derived(sizes.find((size) => size.isCurrent));

	let detailsEl: HTMLDetailsElement | undefined = $state();

	// Picking a size navigates to that size's own product page, but the SPA
	// router can reuse this same component instance rather than remounting it,
	// so the native <details> element wouldn't otherwise close itself.
	afterNavigate(() => {
		if (detailsEl) detailsEl.open = false;
	});

	function handleDocumentClick(event: MouseEvent) {
		if (detailsEl?.open && !event.composedPath().includes(detailsEl)) detailsEl.open = false;
	}

	function handleToggle() {
		if (detailsEl?.open) {
			sendAnalyticsEvent('view_sizes', { product_number: product[AllColumns.Number] });
		}
	}
</script>

<svelte:window onclick={handleDocumentClick} />

{#if sizes.length > 1 && current}
	<details bind:this={detailsEl} class={twMerge('relative', _class)} ontoggle={handleToggle}>
		<summary
			class="flex cursor-pointer list-none items-center gap-3 rounded border border-primary bg-primary p-3 hover:bg-secondary"
		>
			<div class="flex min-w-0 flex-col">
				<span class="text-xs text-secondary">Pakkauskoko · {sizes.length} kokoa</span>
				<strong class="text-sm">
					{formatValue(current.product[AllColumns.BottleSize], AllColumns.BottleSize)} · {formatValue(
						current.product[AllColumns.Price],
						AllColumns.Price
					)}
				</strong>
			</div>
			<Icon name="chevron_down" class="ml-auto shrink-0" />
		</summary>
		<div
			class="absolute top-full left-0 z-20 mt-2 flex w-full min-w-72 flex-col overflow-hidden rounded border border-primary bg-primary shadow-lg"
		>
			{#each sizes as size (size.product[AllColumns.Number])}
				<svelte:element
					this={size.isCurrent ? 'div' : 'a'}
					href={size.isCurrent ? undefined : `/tuotteet/${size.product[AllColumns.Number]}/`}
					class={twMerge(
						'flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-primary px-3 py-2 text-left last:border-b-0',
						size.isCurrent ? 'bg-secondary' : 'hover:bg-secondary'
					)}
				>
					<span
						class={twMerge(
							'block h-2.5 w-2.5 shrink-0 rounded-full border-2',
							size.isCurrent ? 'border-brand-3 bg-brand-3' : 'border-gray-300 dark:border-zinc-600'
						)}
					></span>
					<span class="flex min-w-0 items-baseline gap-1.5">
						<strong class="text-sm">{formatValue(size.product[AllColumns.BottleSize], AllColumns.BottleSize)}</strong>
						{#if size.product[AllColumns.PackagingType]}
							<span class="truncate text-xs text-secondary">{size.product[AllColumns.PackagingType]}</span>
						{/if}
					</span>
					{#if size.isBestValue}
						<span class="rounded bg-green-300 px-1.5 text-xs text-green-800 dark:bg-green-800/40 dark:text-green-300">
							Paras €/L
						</span>
					{/if}
					<span class="ml-auto flex shrink-0 items-center gap-2.5">
						<span class="flex items-center gap-1.5">
							<span class="flex h-1 w-10 overflow-hidden rounded-full bg-gray-200 dark:bg-zinc-700">
								<span
									class={twMerge(
										'h-full rounded-full',
										size.isBestValue ? 'bg-green-500' : 'bg-gray-400 dark:bg-zinc-500'
									)}
									style={`width: ${size.barPercent}%`}
								></span>
							</span>
							<span class="text-xs text-secondary">
								{formatValue(size.product[AllColumns.PricePerLiter], AllColumns.PricePerLiter)}
							</span>
						</span>
						<strong class="text-sm">{formatValue(size.product[AllColumns.Price], AllColumns.Price)}</strong>
					</span>
				</svelte:element>
			{/each}
		</div>
	</details>
{/if}
