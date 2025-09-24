<script lang="ts">
  	import type { DatasetRow } from '$lib/types';
	import type { FullProperties } from 'xlsx';
	import Main from '$lib/components/views/Main.svelte';
	import type { Kaljakori } from '$lib/alko';
	import type { PageProps } from './$types';

	let  { data }: PageProps = $props();

	document.title = 'Alkometriikka';
</script>

{#await data then data}
	<Main kaljakori={data.kaljakori} />
{/await}