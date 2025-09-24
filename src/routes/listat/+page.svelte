<script lang="ts">
	import { goto } from '$app/navigation';
	import List from '$lib/components/views/List.svelte';
	import AllLists from '$lib/components/widgets/AllLists.svelte';
	import { listToURI } from '$lib/utils/lists.js';

    const { data } = $props()

	if (data.list) {
		document.title = `Alkometriikka | Lista - ${data.list.name}`;
	} else {
		document.title = 'Alkometriikka | Listat';
	}
</script>

{#if data.list}
    <List dataset={data.dataset.table} list={data.list} />
{:else}
	<div class="flex flex-col flex-auto p-4 gap-4 items-center">
		<AllLists show={{ delete: true }} action={(list) => {goto(`/listat?list=${listToURI(list)}`)}} />
	</div>
{/if}