<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/images/alko-juominen.png';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Alkoassistentti</title>
</svelte:head>

{@render children?.()}
