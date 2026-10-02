<script lang="ts">
	import Category from '$lib/components/views/Category.svelte';

	let { data } = $props();
</script>

{#await data.alko then alko}
	<Category
		trail={data.trail}
		table={alko.dataset.table}
		availability={alko.availability}
		tree={alko.kaljakori.getCategoryTree()}
	/>
{/await}
