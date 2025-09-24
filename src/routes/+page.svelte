<script lang="ts">
	import Main from '$lib/components/views/Main.svelte';
	import type { PageProps } from './$types';

	let  { data }: PageProps = $props();

	document.title = 'Alkometriikka';
</script>

{#await data then data}
	<Main kaljakori={data.kaljakori} />
{/await}