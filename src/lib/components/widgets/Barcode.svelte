<script lang="ts">
	import { BarcodeDetector } from 'barcode-detector/ponyfill';
	import type { DetectedBarcode } from 'barcode-detector/ponyfill';
	import Popup from './Popup.svelte';
	import Icon from './Icon.svelte';
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';
	import { isMobile } from '$lib/global.svelte';
	import type { Kaljakori } from '$lib/alko';
	import { AllColumns } from '$lib/utils/constants';
	import { goto } from '$app/navigation';

	const barcodeDetector = new BarcodeDetector({
		formats: ['ean_13', 'qr_code']
	});

	function loadDeviceCameraStream(): Promise<MediaStream> {
		return navigator.mediaDevices.getUserMedia({
			video: { facingMode: 'environment', height: 1080, width: 1920, autoGainControl: true },
            audio: false
		});
	}

	const { kaljakori }: { kaljakori: Kaljakori } = $props();

	let videoElement: HTMLVideoElement = $state()!;
	let decodingInterval: ReturnType<typeof setInterval>;
	let decoding = false;
	let stream: null | MediaStream = $state(null);
	let dialogElement: HTMLDialogElement | undefined = $state();
	let cameraFailed = $state(false);

	async function startCamera() {
		try {
			stream = await loadDeviceCameraStream();
			videoElement.srcObject = stream;
			startDecoding();
		} catch (error) {
			cameraFailed = true;
		}
	}

	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files[0]) {
			const file = input.files[0];
			const imageBitmap = await createImageBitmap(file);
			const barcodes = await barcodeDetector.detect(imageBitmap);
			if (barcodes.length > 0) handleDetection(barcodes);
		}
	}

	function stopCamera() {
		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
		}

		decoding = false;
		clearInterval(decodingInterval);
	}

	function startDecoding() {
		clearInterval(decodingInterval);
		decodingInterval = setInterval(decode, 100);
	}

	async function decode() {
		if (decoding === true) return;
		decoding = true;
		let barcodes = await barcodeDetector.detect(videoElement);
		if (barcodes.length > 0) handleDetection(barcodes);
		decoding = false;
	}

	function handleDetection(barcodes: DetectedBarcode[]) {
		// Find which barcode is the largest on screen by area
		let largestBarcode = barcodes[0];
		for (const barcode of barcodes) {
			if (
				barcode.boundingBox.width * barcode.boundingBox.height >
				largestBarcode.boundingBox.width * largestBarcode.boundingBox.height
			) {
				largestBarcode = barcode;
			}
		}
		try {
			if (largestBarcode.format === 'ean_13') handleEANBarcode(largestBarcode);
			if (largestBarcode.format === 'qr_code') handleQRCode(largestBarcode);
			if (dialogElement) dialogElement.close();
		} catch (error) {
			alert(error);
		}
	}

	function handleEANBarcode({ rawValue }: DetectedBarcode) {
		const productCode = rawValue;
		const products = kaljakori.findByColumn(AllColumns.EAN, productCode);
		if (products.length !== 1) throw 'Tuotetta ei löytynyt';
		goto(`/tuotteet/${products[0][AllColumns.Number]}`, { replaceState: true});
	}

	function handleQRCode({ rawValue }: DetectedBarcode) {
		try {
			const url = new URL(rawValue);
			if (url.host !== window.location.host) return;
			goto(url.pathname + url.search);
		} catch (error) {
			throw 'Virheellinen QR-koodi!';
		}
	}
</script>

<Popup
	bind:dialogElement
	onopen={async () => {
		await startCamera();
	}}
	onclose={() => {
		stopCamera();
	}}
>
	{#snippet renderButton(dialogElement: HTMLDialogElement)}
		<button
			class={twMerge(components.button(), 'self-end p-2  text-xl')}
			onclick={() => {
				dialogElement.showModal();
			}}
		>
			<Icon name="scan" />
			{#if !$isMobile}
				<span>Skannaa</span>
			{/if}
		</button>
	{/snippet}
	{#snippet renderContent(dialogElement: HTMLDialogElement)}
		<div class="flex flex-col gap-4 p-4">
			<h2 class="text-center text-xl font-bold">Skannaa viivakoodi</h2>
			<p class="text-center">Skannaa tuotteen viivakoodi kameralla tai lataa kuva viivakoodista.</p>
			<div class="border-2 border-dashed border-gray-400 p-4 text-center">
				<label class="cursor-pointer">
					<input type="file" accept="image/*" class="hidden" onchange={handleFileUpload} />
					<div class="flex flex-col items-center justify-center">
						<Icon name="file" class="mb-2 text-4xl" />
						<span class="text-blue-500 underline">Valitse kuvatiedosto</span>
					</div>
				</label>
			</div>
			{#if cameraFailed}
				<div
					class="flex flex-col items-center text-center p-4"
				>
					<p class="mb-2 text-red-600 text-balance">
						Kameran käyttö epäonnistui. Varmista, että laitteessasi on kamera ja selaimellasi on
						lupa käyttää sitä.
					</p>
					<button class={twMerge(components.button(), '')} onclick={startCamera}>
						Yritä uudelleen
					</button>
				</div>
			{:else}
				<div class="relative flex flex-col">
					<video
						bind:this={videoElement}
						autoplay
						playsinline
						muted
						class={twMerge('aspect-square w-full rounded border object-cover object-center')}
					></video>
					{#if !stream}
						<div class="absolute inset-0 grid place-content-center">
							<span
								class="block h-12 w-12 animate-spin rounded-full border-3 border-brand-3 border-b-transparent"
							></span>
						</div>
					{/if}
				</div>
			{/if}
			<button
				class={twMerge(components.button(), 'mt-4 w-full')}
				onclick={() => {
					dialogElement.close();
				}}>Sulje</button
			>
		</div>
	{/snippet}
</Popup>
