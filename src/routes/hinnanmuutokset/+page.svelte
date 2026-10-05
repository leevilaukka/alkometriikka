<script lang="ts">
	import PriceChanges from '$lib/components/views/PriceChanges.svelte';

	let { data } = $props();
</script>

{#await data.alko then alko}
	<PriceChanges kaljakori={alko.kaljakori} availability={alko.availability} />
{/await}
