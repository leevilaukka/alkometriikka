<script lang="ts">
	import PriceChanges from '$lib/components/views/PriceChanges.svelte';
	import { onlyPreferredStore, preferredStoreId } from '$lib/global.svelte';
	import { get } from 'svelte/store';

	let { data } = $props();

	// With "only my store" on, the changes listed depend on store availability
	const needsStores = get(onlyPreferredStore) && !!get(preferredStoreId);
</script>

{#await needsStores ? data.alkoWithStores : data.alko then alko}
	<PriceChanges kaljakori={alko.kaljakori} availability={alko.availability} />
{/await}
