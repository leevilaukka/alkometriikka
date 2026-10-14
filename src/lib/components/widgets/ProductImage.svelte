<script lang="ts" module>
	import type { ImageTransform } from '$lib/types';

	/** The bottle from the logo, in its 1024×1024 coordinates */
	const BOTTLE =
		'M682.67,473.68v550.32h-341.34V473.68c0-60.39,31.37-113.45,78.7-143.79,15.25-9.77,24.63-26.48,24.63-44.58V96.78h134.68v188.53c0,18.11,9.39,34.81,24.63,44.58,47.33,30.34,78.7,83.4,78.7,143.79Z';

	/**
	 * Shown when a photo fails to load (offline, or a product without one). It has the photo's pixel
	 * size, so boxes that size themselves from the image keep their size instead of following the
	 * length of the alt text.
	 */
	function placeholder(transform: ImageTransform) {
		const [width, height] = transform === 'products' ? [160, 192] : [600, 2600];
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="241 -3 542 1127"><path fill="#d4d4d8" d="${BOTTLE}"/></svg>`;
		return `data:image/svg+xml,${encodeURIComponent(svg)}`;
	}
</script>

<script lang="ts">
	import { generateImageUrl } from '$lib/utils/image';
	import { twMerge } from 'tailwind-merge';
	let {
		number,
		name,
		transform = 'products',
		...rest
	}: { number: string; name: string; transform?: ImageTransform; [key: string]: any } = $props();

	const src = $derived(generateImageUrl(number, transform));
	// Remembered per URL, so a reused component tries again when it shows another product
	let failedSrc = $state<string>();
</script>

<img
	crossorigin="anonymous"
	referrerpolicy="no-referrer"
	src={failedSrc === src ? placeholder(transform) : src}
	alt={name}
	data-name="product-image"
	class={twMerge('block h-full w-full object-contain', rest.class)}
	onerror={() => (failedSrc = src)}
/>
