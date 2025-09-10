<script lang="ts">
    const { value = $bindable([]), options = [] } = $props();

    const text = $derived.by(() => {
        if(value.length > 1) return `${value.length} valittu`
        else if (value.length == 1) return value.at(0);
        else return "Ei valintoja"
    })

    let dialogElement: HTMLDialogElement | undefined = $state()

    let query = $state("")
</script>

<button onclick={() => { dialogElement?.showModal()}} class="border border-gray-300 rounded flex flex-row flex-nowrap px-3 py-2 gap-3">{text}</button>

<dialog open={false} bind:this={dialogElement} class="open:flex w-full h-full flex-col p-4 gap-4">
    <div class="grid grid-cols-2 gap-4 max-h-full overflow-hidden">
        <div class="flex flex-col max-h-full overflow-auto">
            {#each value as v, i}
                <button onclick={() => value.splice(i, 1)}>{v}</button>
            {/each}
        </div>
        <div class="flex flex-col max-h-full overflow-auto">
            <input type="text" bind:value={query} placeholder="Hae..." class="mb-2 p-2 border border-gray-300 rounded" />
            {#each options.filter(option => !value.includes(option)).filter(option => option.toLowerCase().includes(query.toLowerCase())) as o, i}
                <button onclick={() => value.push(o)}>{o}</button>
            {/each}
        </div>
    </div>
    <button onclick={() => { dialogElement?.close() }}>Sulje</button>
</dialog>
