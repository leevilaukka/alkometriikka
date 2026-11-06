<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import Icon from './Icon.svelte';
	import { components } from '$lib/utils/ui/styles';

	type DetectedCode = { rawValue: string; format: string; boundingBox: DOMRectReadOnly };
	type Detector = { detect(source: ImageBitmapSource): Promise<DetectedCode[]> };

	const {
		ondetect,
		onnocode
	}: {
		/**
		 * Called with the largest code in view; scanning pauses until the promise settles. It can ask
		 * for the same code to be left alone for longer than usual (a failed lookup, say).
		 */
		ondetect: (code: {
			rawValue: string;
			format: string;
		}) => Promise<void | { holdMs: number }> | void | { holdMs: number };
		/** A chosen picture had no code in it */
		onnocode: () => void;
	} = $props();

	const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'qr_code'];
	/** The same code held in view isn't handled again for this long (ms) */
	const REPEAT_MS = 3000;

	/**
	 * The browser's own detector where it has one (Chrome on Android), otherwise ZXing compiled to
	 * WebAssembly, served from our own build rather than the library's default CDN
	 */
	async function createDetector(): Promise<Detector> {
		const Native = (globalThis as { BarcodeDetector?: any }).BarcodeDetector;
		if (Native) {
			try {
				const supported: string[] = await Native.getSupportedFormats();
				if (['ean_13', 'qr_code'].every((format) => supported.includes(format))) {
					return new Native({ formats: FORMATS.filter((format) => supported.includes(format)) });
				}
			} catch {
				// Fall back to ZXing
			}
		}
		const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
			import('barcode-detector/ponyfill'),
			import('zxing-wasm/reader/zxing_reader.wasm?url')
		]);
		prepareZXingModule({
			overrides: {
				locateFile: (path: string, prefix: string) =>
					path.endsWith('.wasm') ? wasmUrl : prefix + path
			}
		});
		return new BarcodeDetector({ formats: FORMATS as never });
	}

	let detector: Promise<Detector> | undefined;
	const getDetector = () => (detector ??= createDetector());

	let videoElement = $state<HTMLVideoElement>();
	let stream = $state<MediaStream | null>(null);
	let cameraState = $state<'starting' | 'running' | 'denied' | 'unavailable'>('starting');
	let interval: ReturnType<typeof setInterval> | undefined;
	let busy = false;
	let last = { value: '', at: 0, holdMs: REPEAT_MS };
	let destroyed = false;

	async function startCamera() {
		if (stream || destroyed) return;
		cameraState = 'starting';
		if (!navigator.mediaDevices?.getUserMedia) {
			cameraState = 'unavailable';
			return;
		}
		try {
			const opened = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
				audio: false
			});
			// Closed or hidden while the permission prompt was up
			if (destroyed || document.hidden) {
				opened.getTracks().forEach((track) => track.stop());
				return;
			}
			stream = opened;
			cameraState = 'running';
			getDetector();
			clearInterval(interval);
			interval = setInterval(scanFrame, 200);
		} catch (error) {
			cameraState =
				error instanceof DOMException && error.name === 'NotAllowedError'
					? 'denied'
					: 'unavailable';
		}
	}

	function stopCamera() {
		clearInterval(interval);
		interval = undefined;
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
	}

	async function handle(codes: DetectedCode[]) {
		if (codes.length === 0) return;
		const area = (code: DetectedCode) => code.boundingBox.width * code.boundingBox.height;
		const largest = codes.reduce((best, code) => (area(code) > area(best) ? code : best));
		const now = Date.now();
		if (largest.rawValue === last.value && now - last.at < last.holdMs) return;
		busy = true;
		let holdMs = REPEAT_MS;
		try {
			const result = await ondetect({ rawValue: largest.rawValue, format: largest.format });
			if (result) holdMs = Math.max(holdMs, result.holdMs);
		} finally {
			last = { value: largest.rawValue, at: Date.now(), holdMs };
			busy = false;
		}
	}

	async function scanFrame() {
		if (busy || !videoElement || videoElement.readyState < 2) return;
		busy = true;
		let codes: DetectedCode[] = [];
		try {
			codes = await (await getDetector()).detect(videoElement);
		} catch {
			// A frame that can't be read; try the next one
		} finally {
			busy = false;
		}
		await handle(codes);
	}

	async function scanFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const codes = await (await getDetector()).detect(await createImageBitmap(file)).catch(() => []);
		// A picture is chosen on purpose, so the same code is handled again
		last = { value: '', at: 0, holdMs: REPEAT_MS };
		if (codes.length === 0) onnocode();
		else await handle(codes);
	}

	// The video is drawn again after a retry, so it's given the stream whenever either changes
	$effect(() => {
		if (videoElement) videoElement.srcObject = stream;
	});

	// The camera is let go of while the page is in the background, and picked up again on return
	function handleVisibility() {
		if (document.hidden) stopCamera();
		else startCamera();
	}

	onMount(() => {
		document.addEventListener('visibilitychange', handleVisibility);
		startCamera();
	});

	onDestroy(() => {
		destroyed = true;
		document.removeEventListener('visibilitychange', handleVisibility);
		stopCamera();
	});
</script>

<div class="flex flex-col gap-3">
	{#if cameraState === 'denied' || cameraState === 'unavailable'}
		<div
			class="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded border border-primary p-4 text-center"
		>
			<Icon name="camera" class="text-3xl text-secondary" />
			<p class="text-balance">
				{cameraState === 'denied'
					? 'Kameran käyttö on estetty. Salli kamera selaimen asetuksista ja yritä uudelleen.'
					: 'Kameraa ei löytynyt tai sitä ei voi käyttää tässä selaimessa.'}
			</p>
			<button type="button" class={components.button()} onclick={startCamera}
				>Yritä uudelleen</button
			>
		</div>
	{:else}
		<div class="relative overflow-hidden rounded border border-primary bg-black">
			<video
				bind:this={videoElement}
				autoplay
				playsinline
				muted
				class="aspect-[4/3] w-full object-cover"
			></video>
			<!-- Where to aim: barcodes are wide, so the frame is too -->
			<div
				aria-hidden="true"
				class="pointer-events-none absolute inset-x-[12%] top-1/2 h-1/3 -translate-y-1/2 rounded-lg border-2 border-white/80 shadow-[0_0_0_100vmax_rgb(0_0_0/0.25)]"
			></div>
			{#if cameraState === 'starting'}
				<div class="absolute inset-0 grid place-content-center">
					<span
						class="block h-12 w-12 animate-spin rounded-full border-3 border-brand-3 border-b-transparent"
					></span>
				</div>
			{/if}
		</div>
	{/if}
	<label class={twMerge(components.button(), 'cursor-pointer self-center')}>
		<input type="file" accept="image/*" class="sr-only" onchange={scanFile} />
		<Icon name="image" />
		<span>Valitse kuva viivakoodista</span>
	</label>
</div>
