<script lang="ts">
  	import type { DatasetRow } from '$lib/types';
	import type { FullProperties } from 'xlsx';
	import Main from '$lib/components/views/Main.svelte';
	import type { Kaljakori } from '$lib/alko';

	let  { data }: { data: Promise<{ dataset: { table: DatasetRow[]; metadata: FullProperties }, kaljakori: Kaljakori }> } = $props();
</script>

{#await data then data}
	<Main kaljakori={data.kaljakori} />
{/await}