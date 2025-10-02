<script lang="ts">
	import Main from '$lib/components/views/Main.svelte';
	import { generateTitle } from '$lib/utils/helpers';
	import type { PageProps } from './$types';

	let  { data }: PageProps = $props();

	document.title = generateTitle();
</script>

{#await data.alko then alko}
	<Main kaljakori={alko.kaljakori} />
{/await}