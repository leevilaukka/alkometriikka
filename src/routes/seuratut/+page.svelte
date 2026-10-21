<script lang="ts">
	import Watchlist from '$lib/components/views/Watchlist.svelte';

	let { data } = $props();
</script>

{#await data.alkoWithStores then alko}
	<Watchlist kaljakori={alko.kaljakori} availability={alko.availability} />
{/await}
