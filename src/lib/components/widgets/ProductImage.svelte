<script lang="ts" module>
	import type { ImageTransform } from '$lib/types';

	/** Pixel size of Alko's photos per transform (`small` ones vary in width, `medium` in height) */
	const SIZES: Record<ImageTransform, [number, number]> = {
		products: [160, 192],
		small: [115, 500],
		medium: [600, 2600],
		large: [900, 3900]
	};

	/** The bottle from the logo, in its 1024×1024 coordinates */
	const BOTTLE =
		'M682.67,473.68v550.32h-341.34V473.68c0-60.39,31.37-113.45,78.7-143.79,15.25-9.77,24.63-26.48,24.63-44.58V96.78h134.68v188.53c0,18.11,9.39,34.81,24.63,44.58,47.33,30.34,78.7,83.4,78.7,143.79Z';

	/**
	 * Shown while a photo loads and when it fails (offline, or a product without one). It has the
	 * photo's pixel size, so boxes that size themselves from the image are the same size in every
	 * state, instead of collapsing while loading or following the length of the alt text on failure.
	 */
	function placeholder(transform: ImageTransform) {
		const [width, height] = SIZES[transform];
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="241 -3 542 1127"><path fill="#d4d4d8" d="${BOTTLE}"/></svg>`;
		return `data:image/svg+xml,${encodeURIComponent(svg)}`;
	}
</script>

<script lang="ts">
	import { displayImageUrl, fallbackImageUrl } from '$lib/utils/catalog/alko';
	import { twMerge } from 'tailwind-merge';
	let {
		number,
		name,
		transform = 'products',
		priority = false,
		...rest
	}: {
		number: string;
		name: string;
		transform?: ImageTransform;
		/** The page's main photo (its LCP element): fetched ahead of other images */
		priority?: boolean;
		[key: string]: any;
	} = $props();

	const src = $derived(displayImageUrl(number, transform));
	const fallback = $derived(fallbackImageUrl(number, transform));
	/** The URL that loaded, keyed by the `src` it was loaded for */
	let loaded = $state<{ for: string; url: string }>();

	// The photo downloads in the background and replaces the placeholder once it's complete, from
	// the browser's cache. Reruns for each product, so a reused component tries every photo.
	// Product page stubs preload their photo with these same request settings
	// (scripts/lib/stub.ts), so the probe reuses that download
	$effect(() => {
		const url = src;
		const fallbackUrl = fallback;
		const probe = new Image();
		probe.crossOrigin = 'anonymous';
		probe.referrerPolicy = 'no-referrer';
		if (priority) probe.fetchPriority = 'high';
		probe.onload = () => (loaded = { for: url, url: probe.src });
		// Browsers that can't decode the AVIF photo get the WebP/JPEG one
		probe.onerror = () => {
			if (fallbackUrl && probe.src !== fallbackUrl) probe.src = fallbackUrl;
		};
		probe.src = url;
		return () => (probe.onload = probe.onerror = null);
	});
</script>

<img
	crossorigin="anonymous"
	referrerpolicy="no-referrer"
	src={loaded?.for === src ? loaded.url : placeholder(transform)}
	alt={name}
	fetchpriority={priority ? 'high' : undefined}
	data-name="product-image"
	class={twMerge('block h-full w-full object-contain', rest.class)}
/>
