<script lang="ts">
	import Watchlist from '$lib/components/views/Watchlist.svelte';

	let { data } = $props();
	// Watched products may have been removed from the selection since
	const ready = $derived(
		Promise.all([data.alkoWithStores, data.alkoWithRemoved]).then(([alko]) => alko)
	);
</script>

{#await ready then alko}
	<Watchlist kaljakori={alko.kaljakori} availability={alko.availability} />
{/await}
