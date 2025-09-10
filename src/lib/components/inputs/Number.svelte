<script>
    let { value = $bindable([-Infinity, Infinity]), min = 0, max = 100, step = 1 } = $props(); 
</script>

<input type="number" bind:value={value[0]} min={min} max={value[1]} step={step} class="border border-gray-300 rounded flex flex-row flex-nowrap px-3 py-2"/>
<span class="my-auto">-</span>
<input type="number" bind:value={value[1]} min={value[0]} max={max} step={step} class="border border-gray-300 rounded flex flex-row flex-nowrap px-3 py-2"/>