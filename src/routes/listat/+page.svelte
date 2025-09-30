<script lang="ts">
	import { goto } from '$app/navigation';
	import List from '$lib/components/views/List.svelte';
	import AllLists from '$lib/components/widgets/AllLists.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { generateTitle } from '$lib/utils/helpers.js';
	import { listToURI } from '$lib/utils/lists.js';
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';

    const { data } = $props()

	if (data.list) {
		document.title = generateTitle(`Lista - ${data.list.name}`);
	} else {
		document.title = generateTitle('Listat');
	}
</script>

{#if data.list}
    <List dataset={data.dataset.table} list={data.list} />
{:else}
	<div class={twMerge("flex flex-col gap-4 w-[min(80ch,_100%)] mx-auto p-4")}>
		<div class="flex w-full items-center gap-4">
			<button
				onclick={() => window.history.back()}
				class={twMerge(components.button({ size: "md" }))}
			>
				<Icon name="arrow_left" class="inline-block" />
				<span>Takaisin</span>
			</button>
		</div>
		<div class="flex flex-col flex-auto gap-4 items-center">
			<AllLists show={{ delete: true }} action={(list) => {goto(`/listat?list=${listToURI(list)}`)}} />
		</div>
	</div>
{/if}