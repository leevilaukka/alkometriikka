<script lang="ts">
	import type { ImageTransform } from '$lib/types';
    import { generateImageUrl } from '$lib/utils/image';
	import { twMerge } from 'tailwind-merge';
    let { number, name, transform, ...rest }: { number: string, name: string, transform?: ImageTransform, [key: string]: any } = $props();

</script>


<img
	crossorigin="anonymous"
	referrerpolicy="no-referrer"
	src={generateImageUrl(number, name, transform || "products")}
	alt={name}
	data-name="product-image"
	class={twMerge("block h-full w-full object-contain", rest.class)}
/>
