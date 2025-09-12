<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/images/favicon.png';
	import { dev } from '$app/environment';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Alkometriikka {dev && '- DEV'}</title>
</svelte:head>

{@render children?.()}
