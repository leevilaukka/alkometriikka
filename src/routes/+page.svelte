<script lang="ts">
  	import type { DatasetRow } from '$lib/types';
	import Main from "$lib/components/views/Main.svelte";
	import type { FullProperties } from 'xlsx';

	let { data }: { data: { dataset: Promise<{table: DatasetRow[], metadata: FullProperties}> }} = $props();
</script>

{#await data.dataset then dataset}
	<Main dataset={dataset}/>
{/await}