<script>
	import { components } from "$lib/utils/style";
	import { twMerge } from "tailwind-merge";

    let { value = $bindable([-Infinity, Infinity]), min = 0, max = 100, step = 1 } = $props(); 
</script>

<input type="number" bind:value={value[0]} min={min} max={value[1]} step={step} class={twMerge(components.input(), "w-full")}/>
<span class="my-auto">-</span>
<input type="number" bind:value={value[1]} min={value[0]} max={max} step={step} class={twMerge(components.input(), "w-full")}/>