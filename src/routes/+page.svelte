<script lang="ts">
	import Main from '$lib/components/views/Main.svelte';
	import { generateTitle } from '$lib/utils/helpers';
	import type { PageProps } from './$types';

	let  { data }: PageProps = $props();

	document.title = generateTitle();
</script>

{#await data then data}
	<Main kaljakori={data.kaljakori} />
{/await}