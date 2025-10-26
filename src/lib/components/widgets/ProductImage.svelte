<script lang="ts">
    import { generateImageUrl } from '$lib/utils/image';
	import { twMerge } from 'tailwind-merge';
    let { number, name, transform, ...rest }: { number: string, name: string, transform?: "medium" | "products", [key: string]: any } = $props();

</script>


<img
	crossorigin="anonymous"
	referrerpolicy="no-referrer"
	src={generateImageUrl(number, name, transform || "products")}
	alt={name}
	class={twMerge("block h-full w-full object-contain", rest.class)}
/>
