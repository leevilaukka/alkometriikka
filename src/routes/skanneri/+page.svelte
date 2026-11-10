<script module lang="ts">
	import { readRecentScans, withScan, writeRecentScans } from '$lib/utils/user/recentScans';

	// Module state, so the list is still there when the visitor comes back from a product page
	const recent = $state({ ids: readRecentScans() });

	function rememberScan(id: string) {
		recent.ids = withScan(recent.ids, id);
		writeRecentScans(recent.ids);
	}

	function clearRecentScans() {
		recent.ids = [];
		writeRecentScans([]);
	}
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { twMerge } from 'tailwind-merge';
	import type { Kaljakori } from '$lib/alko';
	import type { PriceListItem } from '$lib/types';
	import AddToListButton from '$lib/components/widgets/AddToListButton.svelte';
	import Barcode from '$lib/components/widgets/Barcode.svelte';
	import CompareButton from '$lib/components/widgets/CompareButton.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import PageHeader from '$lib/components/widgets/PageHeader.svelte';
	import ProductImage from '$lib/components/widgets/ProductImage.svelte';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { requestPaletteOpen } from '$lib/utils/app/commandPalette';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { appPath } from '$lib/utils/app/paths';
	import { staticPage } from '$lib/utils/app/seo';
	import { findProductByBarcode, normalizeBarcode } from '$lib/utils/catalog/barcode';
	import { API_ORIGIN } from '$lib/utils/constants/app';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { formatValue } from '$lib/utils/format/format';
	import { components } from '$lib/utils/ui/styles';

	let { data } = $props();

	type Status =
		| { kind: 'idle' | 'no_code' | 'bad_qr' }
		| { kind: 'searching' | 'not_found' | 'error'; code: string };
	let status = $state<Status>({ kind: 'idle' });
	let typed = $state('');

	// Removed products too, as an old barcode may only be on one of them
	let kaljakori = $state.raw<Kaljakori>();
	$effect(() => {
		data.alkoWithRemoved.then((alko) => (kaljakori = alko.kaljakori));
	});

	const recentProducts = $derived(
		kaljakori
			? recent.ids
					.map((id) => kaljakori!.findById(id))
					.filter((product): product is PriceListItem => Boolean(product))
			: []
	);

	/** A failed lookup (Alko down, rate limited) isn't retried for this long while the code stays in view */
	const ERROR_HOLD_MS = 30_000;

	async function openProduct(productNumber: string) {
		rememberScan(productNumber);
		status = { kind: 'idle' };
		await goto(appPath(`/tuotteet/${productNumber}/`));
	}

	async function lookupEan(ean: string): Promise<{ holdMs: number } | void> {
		status = { kind: 'searching', code: ean };
		const { kaljakori } = await data.alkoWithRemoved;
		const match = await findProductByBarcode(kaljakori, ean);
		const productNumber = match.product?.[AllColumns.Number];
		const link = productNumber ? appPath(`/tuotteet/${productNumber}/`) : undefined;
		sendAnalyticsEvent('scan_barcode', { ean, link, source: match.source });
		if (productNumber) {
			await openProduct(productNumber);
		} else if (match.source === 'error') {
			status = { kind: 'error', code: ean };
			return { holdMs: ERROR_HOLD_MS };
		} else {
			status = { kind: 'not_found', code: ean };
		}
	}

	/** Alko's shelf labels have a QR code linking to the product on alko.fi */
	async function openQrCode(value: string) {
		let url: URL;
		try {
			url = new URL(value);
		} catch {
			status = { kind: 'bad_qr' };
			return;
		}
		if (url.hostname === 'alko.fi' || url.hostname === 'www.alko.fi') {
			const productNumber = url.pathname.match(/\/(?:tuotteet|produkter|products)\/(\d+)/)?.[1];
			const { kaljakori } = await data.alkoWithRemoved;
			const product = productNumber ? kaljakori.findById(productNumber) : undefined;
			if (!productNumber || !product) {
				status = productNumber ? { kind: 'not_found', code: productNumber } : { kind: 'bad_qr' };
				return;
			}
			sendAnalyticsEvent('scan_qr_code', {
				type: 'alko_product_qr',
				product_number: productNumber,
				link: appPath(`/tuotteet/${productNumber}/`)
			});
			await openProduct(productNumber);
		} else if (url.host === window.location.host) {
			await goto(url.pathname + url.search + url.hash);
		} else {
			status = { kind: 'bad_qr' };
		}
	}

	async function handleCode({ rawValue, format }: { rawValue: string; format: string }) {
		if (format === 'qr_code') return openQrCode(rawValue);
		return lookupEan(normalizeBarcode(rawValue, format));
	}

	function submitTyped(event: SubmitEvent) {
		event.preventDefault();
		const ean = typed.replace(/\s/g, '');
		if (ean) lookupEan(ean);
	}

	const { description, keywords } = staticPage('/skanneri/');
	setSEO({
		og: { title: generateTitle('Skanneri'), description, url: window.location.href },
		keywords,
		description
	});
</script>

<svelte:head>
	<title>{generateTitle('Skanneri')}</title>
	<!-- The first barcode data.json doesn't know is asked from the Worker; have the connection ready -->
	<link rel="preconnect" href={API_ORIGIN} crossorigin="anonymous" />
</svelte:head>

<div class="mx-auto flex w-full max-w-xl flex-col gap-6 p-4 md:p-6">
	<PageHeader
		title="Skanneri"
		description="Skannaa tuotteen viivakoodi tai hyllynreunan QR-koodi, niin tuotteen sivu aukeaa."
	/>

	<Barcode ondetect={handleCode} onnocode={() => (status = { kind: 'no_code' })} />

	<div class="flex min-h-6 flex-col items-center gap-3 text-center">
		<p aria-live="polite" class="text-balance">
			{#if status.kind === 'searching'}
				<span class="text-secondary">Haetaan tuotetta {status.code}…</span>
			{:else if status.kind === 'not_found'}
				Koodilla {status.code} ei löytynyt tuotetta Alkon valikoimasta.
				<span class="block text-sm text-secondary">
					Alko ei ehkä myy tuotetta, tai sillä on eri koodi. Kokeile hyllynreunan QR-koodia tai hae
					nimellä.
				</span>
			{:else if status.kind === 'error'}
				Haku epäonnistui. Tarkista nettiyhteys ja yritä uudelleen.
			{:else if status.kind === 'no_code'}
				Kuvasta ei löytynyt viivakoodia.
			{:else if status.kind === 'bad_qr'}
				QR-koodi ei ole Alkon tuotelinkki.
			{/if}
		</p>
		{#if status.kind === 'error'}
			{@const code = status.code}
			<button type="button" class={components.button()} onclick={() => lookupEan(code)}>
				<Icon name="refresh" />
				<span>Yritä uudelleen</span>
			</button>
		{:else if status.kind === 'not_found'}
			<button
				type="button"
				class={components.button()}
				onclick={() => requestPaletteOpen('product')}
			>
				<Icon name="search" />
				<span>Hae nimellä</span>
			</button>
		{/if}
	</div>

	<form class="flex items-end gap-2" onsubmit={submitTyped}>
		<label class="flex flex-1 flex-col gap-1 text-sm">
			<span class="text-secondary">Tai kirjoita viivakoodin numero</span>
			<input
				bind:value={typed}
				inputmode="numeric"
				autocomplete="off"
				pattern="[0-9 ]*"
				maxlength="17"
				placeholder="6412700709703"
				class={twMerge(components.input(), 'w-full')}
			/>
		</label>
		<button type="submit" class={twMerge(components.button(), 'p-2')} aria-label="Hae">
			<Icon name="search" />
		</button>
	</form>

	{#if recentProducts.length}
		<section aria-labelledby="recent-scans" class="flex flex-col gap-3">
			<div class="flex items-center justify-between gap-3">
				<h2 id="recent-scans" class="text-lg font-bold">Skannatut</h2>
				<button
					type="button"
					class={components.button({ type: 'noborder' })}
					onclick={clearRecentScans}
				>
					<Icon name="trash" />
					<span>Tyhjennä</span>
				</button>
			</div>
			<ul class="flex flex-col gap-2">
				{#each recentProducts as product (product[AllColumns.Number])}
					{@const number = product[AllColumns.Number]}
					{@const href = resolve(`/tuotteet/${number}/`)}
					<li class="flex gap-3 rounded border border-primary p-2">
						<a
							{href}
							tabindex="-1"
							aria-hidden="true"
							class="flex h-16 w-12 shrink-0 items-center justify-center rounded bg-white p-1"
						>
							<ProductImage
								{number}
								name={product[AllColumns.Name]}
								alt=""
								lazy
								class="h-full w-full object-contain"
							/>
						</a>
						<div class="flex min-w-0 flex-1 flex-col gap-1">
							<a {href} class="line-clamp-2 font-semibold hover:underline">
								{product[AllColumns.Name]}
							</a>
							<span class="text-sm text-secondary">
								{formatValue(product[AllColumns.Price], AllColumns.Price)} · {formatValue(
									product[AllColumns.BottleSize],
									AllColumns.BottleSize
								)} · {formatValue(product[AllColumns.PricePerLiter], AllColumns.PricePerLiter)}
								{#if product[AllColumns.RemovedFromSelection]}· Poistunut valikoimasta{/if}
							</span>
							<div class="mt-1 flex flex-wrap gap-2">
								<CompareButton productNumber={number} name={product[AllColumns.Name]} />
								<AddToListButton productNumber={number} type="primary" />
							</div>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
