<script lang="ts">
	import { AllColumns } from '$lib/utils/constants/columns';
	import type { PriceListItem } from '$lib/types';
	import type { SaleInfo } from '$lib/utils/catalog/sales';
	import ProductImage from '../widgets/ProductImage.svelte';
	import Icon from '../widgets/Icon.svelte';
	import { formatValue } from '$lib/utils/format/format';
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';

	const {
		product,
		sale,
		class: _class = ''
	}: { product: PriceListItem; sale: SaleInfo | null; class?: string } = $props();

	let dialogElement = $state<HTMLDialogElement>();
	/** The large photo is only requested once the zoom has been opened, and kept so it doesn't vanish while the dialog fades out */
	let zoomed = $state(false);
	let zoomLoading = $state(false);
	/** The zoom photo is slow enough to need a spinner; quick loads would only flash one */
	let zoomSlow = $state(false);

	$effect(() => {
		zoomSlow = false;
		if (!zoomLoading) return;
		const timer = setTimeout(() => (zoomSlow = true), 300);
		return () => clearTimeout(timer);
	});

	function openZoom() {
		zoomed = true;
		sendAnalyticsEvent('open_zoomed_image', { product_number: product[AllColumns.Number] });
		dialogElement?.showModal();
	}
</script>

<div
	class={twMerge(
		'group relative flex aspect-square w-full shrink-0 rounded bg-white p-6 lg:w-[360px]',
		_class
	)}
>
	<button
		type="button"
		class="h-full w-full cursor-zoom-in lg:pointer-events-none lg:cursor-auto"
		aria-label="Suurenna kuva"
		onclick={openZoom}
	>
		<ProductImage
			number={product[AllColumns.Number]}
			name={product[AllColumns.Name]}
			transform="medium"
			priority
			alt={product[AllColumns.Name]}
		/>
	</button>
	<!-- On desktop only the magnifier opens the zoom; on touch screens the photo itself does -->
	<button
		type="button"
		class={twMerge(
			components.button(),
			'absolute right-2 bottom-2 hidden opacity-0 group-hover:opacity-100 focus-visible:opacity-100 lg:flex'
		)}
		aria-label="Suurenna kuva"
		onclick={openZoom}
	>
		<Icon name="zoom_in" />
	</button>
	{#if sale}
		<span
			class="absolute top-4 left-4 flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-sm font-bold text-white"
		>
			<Icon name="price_tag" />
			<span>-{sale.discountPercent} %</span>
		</span>
	{/if}
</div>

<!-- Full-screen and closes on any click, so a tap anywhere dismisses it
	(`closedby` isn't supported by every mobile browser) -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogElement}
	aria-label={product[AllColumns.Name]}
	closedby="any"
	onclick={() => dialogElement?.close()}
	class="m-0 h-dvh max-h-none w-dvw max-w-none items-center justify-center overflow-hidden bg-black/80 open:flex"
>
	<div class="flex flex-col items-center gap-3">
		<button
			type="button"
			class="relative cursor-zoom-out rounded bg-white p-4"
			aria-label={product[AllColumns.Name]}
		>
			{#if zoomed}
				<ProductImage
					number={product[AllColumns.Number]}
					name={product[AllColumns.Name]}
					transform="large"
					bind:loading={zoomLoading}
					class="max-h-[60dvh] max-w-[min(900px,90vw-2rem)]"
				/>
			{/if}
			{#if zoomSlow}
				{@render spinner('top-3 left-3')}
			{/if}
		</button>
		<!-- The name, price and number, to show to a store clerk -->
		<button
			type="button"
			class="flex w-full max-w-[min(900px,90vw)] cursor-pointer flex-col gap-1 rounded-lg border border-primary bg-primary p-4 text-center shadow-lg"
		>
			<span class="text-xl leading-tight font-bold">{product[AllColumns.Name]}</span>
			<span class="text-2xl font-bold">
				{formatValue(product[AllColumns.Price], AllColumns.Price)}
				<span class="text-base font-normal text-secondary">
					· {formatValue(product[AllColumns.BottleSize], AllColumns.BottleSize)}
				</span>
			</span>
			<span class="text-secondary">Tuotenumero {product[AllColumns.Number]}</span>
		</button>
	</div>
	<button
		type="button"
		class={twMerge(components.button(), 'absolute top-3 right-3')}
		aria-label="Sulje"
	>
		<Icon name="x" />
	</button>
</dialog>

<!-- Shown on a stand-in photo, so it's clear a sharper one is on its way -->
{#snippet spinner(position: string)}
	<span
		role="status"
		aria-label="Ladataan kuvaa"
		class={twMerge(
			'pointer-events-none absolute block h-5 w-5 animate-spin rounded-full border-2 border-brand-1 border-b-transparent',
			position
		)}
	></span>
{/snippet}
