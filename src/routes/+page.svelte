<script lang="ts">
	import Main from '$lib/components/views/Main.svelte';
	import { generateTitle, resetSEO } from '$lib/utils/helpers';
	import type { PageProps } from './$types';

	let  { data }: PageProps = $props();
	resetSEO();
</script>

<svelte:head>
	<title>{generateTitle()}</title>
</svelte:head>

{#await data.alko then alko}
	<Main kaljakori={alko.kaljakori} />
{/await}