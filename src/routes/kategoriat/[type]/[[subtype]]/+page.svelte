<script lang="ts">
	import Category from '$lib/components/views/Category.svelte';
	import { onlyPreferredStore, preferredStoreId } from '$lib/global.svelte';
	import { get } from 'svelte/store';

	let { data } = $props();

	// With "only my store" on, the products depend on store availability
	const needsStores = get(onlyPreferredStore) && !!get(preferredStoreId);
</script>

{#await needsStores ? data.alkoWithStores : data.alko then alko}
	<Category
		trail={data.trail}
		kaljakori={alko.kaljakori}
		table={alko.dataset.table}
		availability={alko.availability}
		tree={alko.kaljakori.getCategoryTree()}
	/>
{/await}
