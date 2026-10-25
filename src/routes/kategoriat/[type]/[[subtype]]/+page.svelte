<script lang="ts">
	import Category from '$lib/components/views/Category.svelte';
	import type { ListPosition } from '$lib/components/views/Main.svelte';
	import { beforeNavigate } from '$app/navigation';
	import { onlyPreferredStore, preferredStoreId } from '$lib/global.svelte';
	import { get } from 'svelte/store';
	import type { Snapshot } from './$types';

	let { data } = $props();

	// With "only my store" on, the products depend on store availability
	const needsStores = get(onlyPreferredStore) && !!get(preferredStoreId);

	// Going back to the list returns to where it was scrolled. Cleared on every navigation so
	// only back/forward, which restores the snapshot, scrolls it (moving between categories
	// keeps this page and its old position around).
	let category: Category | undefined = $state();
	let position: ListPosition | undefined = $state();
	beforeNavigate(() => (position = undefined));
	export const snapshot: Snapshot<ListPosition | undefined> = {
		capture: () => category?.currentPosition(),
		restore: (value) => (position = value)
	};
</script>

{#await needsStores ? data.alkoWithStores : data.alko then alko}
	<Category
		trail={data.trail}
		kaljakori={alko.kaljakori}
		availability={alko.availability}
		tree={alko.kaljakori.getCategoryTree()}
		{position}
		bind:this={category}
	/>
{/await}
