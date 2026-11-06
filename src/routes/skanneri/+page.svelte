<script lang="ts">
	import { goto } from '$app/navigation';
	import { twMerge } from 'tailwind-merge';
	import Barcode from '$lib/components/widgets/Barcode.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import PageHeader from '$lib/components/widgets/PageHeader.svelte';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { appPath } from '$lib/utils/app/paths';
	import { staticPage } from '$lib/utils/app/seo';
	import {
		findProductByBarcode,
		GTIN_API_ORIGIN,
		normalizeBarcode
	} from '$lib/utils/catalog/barcode';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { components } from '$lib/utils/ui/styles';

	let { data } = $props();

	type Status =
		| { kind: 'idle' | 'no_code' | 'bad_qr' | 'error' }
		| { kind: 'searching' | 'not_found'; code: string };
	let status = $state<Status>({ kind: 'idle' });
	let typed = $state('');

	/** A failed lookup (Alko down, rate limited) isn't retried for this long while the code stays in view */
	const ERROR_HOLD_MS = 30_000;

	async function lookupEan(ean: string): Promise<{ holdMs: number } | void> {
		status = { kind: 'searching', code: ean };
		// Removed products too, as an old barcode may only be on one of them
		const { kaljakori } = await data.alkoWithRemoved;
		const match = await findProductByBarcode(kaljakori, ean);
		const link = match.product
			? appPath(`/tuotteet/${match.product[AllColumns.Number]}/`)
			: undefined;
		sendAnalyticsEvent('scan_barcode', { ean, link, source: match.source });
		if (link) {
			status = { kind: 'idle' };
			await goto(link);
		} else {
			status = match.source === 'error' ? { kind: 'error' } : { kind: 'not_found', code: ean };
			if (match.source === 'error') return { holdMs: ERROR_HOLD_MS };
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
			const link = appPath(`/tuotteet/${productNumber}/`);
			sendAnalyticsEvent('scan_qr_code', {
				type: 'alko_product_qr',
				product_number: productNumber,
				link
			});
			await goto(link);
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
	<link rel="preconnect" href={GTIN_API_ORIGIN} crossorigin="anonymous" />
</svelte:head>

<div class="mx-auto flex w-full max-w-xl flex-col gap-6 p-4 md:p-6">
	<PageHeader
		title="Skanneri"
		description="Skannaa tuotteen viivakoodi tai hyllynreunan QR-koodi, niin tuotteen sivu aukeaa."
	/>

	<Barcode ondetect={handleCode} onnocode={() => (status = { kind: 'no_code' })} />

	<p aria-live="polite" class="min-h-6 text-center text-balance">
		{#if status.kind === 'searching'}
			<span class="text-secondary">Haetaan tuotetta {status.code}…</span>
		{:else if status.kind === 'not_found'}
			Koodilla {status.code} ei löytynyt tuotetta Alkon valikoimasta.
		{:else if status.kind === 'error'}
			Haku epäonnistui. Tarkista nettiyhteys ja yritä uudelleen.
		{:else if status.kind === 'no_code'}
			Kuvasta ei löytynyt viivakoodia.
		{:else if status.kind === 'bad_qr'}
			QR-koodi ei ole Alkon tuotelinkki.
		{/if}
	</p>

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
</div>
