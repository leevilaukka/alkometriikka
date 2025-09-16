<script lang="ts">
  	import type { DatasetRow } from '$lib/alko/types';
	import Main from "$lib/components/views/Main.svelte";
	import type { FullProperties } from 'xlsx';

	let { data }: { data: { dataset: Promise<{table: DatasetRow[], metadata: FullProperties}> }} = $props();
</script>

{#await data.dataset}
	<div class="grid w-full h-full place-content-center">
		<div class="flex flex-col gap-3 items-center">
			<span class="block w-16 h-16 border-[0.5rem] border-red-600 border-b-transparent animate-spin rounded-full"></span>
			<p>Ladataan...</p>
		</div>
	</div>
{:then dataset}
	<Main {dataset}/>
{:catch error}
	<div class="grid w-full h-full place-content-center">
		<div class="flex flex-col gap-3 items-center">
			<p>Virhe datan lataamisessa: {error.message}</p>
			<button class="bg-red-600 text-white py-2 px-4 rounded" onclick={() => location.reload()}>Yritä uudelleen</button>
		</div>
	</div>
{/await}