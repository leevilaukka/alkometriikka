<script>
	import Barcode from "$lib/components/widgets/Barcode.svelte";

    const { data } = $props()
</script>

{#await data.alko}
    <div class="grid h-full w-full place-content-center">
        <div class="flex flex-col items-center gap-3">
            <span
                class="block h-16 w-16 animate-spin rounded-full border-[0.5rem] border-red-600 border-b-transparent"
            ></span>
            <p>Ladataan...</p>
        </div>
    </div>
{:then alko}
    <Barcode kaljakori={alko.kaljakori}/>
{/await}