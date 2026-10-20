<script lang="ts">
	import Season from '$lib/components/views/Season.svelte';
	import { onlyPreferredStore, preferredStoreId } from '$lib/global.svelte';
	import { get } from 'svelte/store';

	let { data } = $props();

	// With "only my store" on, the products depend on store availability
	const needsStores = get(onlyPreferredStore) && !!get(preferredStoreId);
</script>

{#await needsStores ? data.alkoWithStores : data.alko then alko}
	<Season season={data.season} kaljakori={alko.kaljakori} availability={alko.availability} />
{/await}
