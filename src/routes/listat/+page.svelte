<script lang="ts">
	import List from '$lib/components/views/List.svelte';
	import AllLists from '$lib/components/widgets/AllLists.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { generateTitle, setSEO } from '$lib/utils/helpers.js';
	import { listToURI } from '$lib/utils/lists.js';
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';

	const { data } = $props();

	$effect(() => {
		setSEO({
			description: data.list
				? `Katso lista "${data.list.name}" Alkometriikassa.`
				: 'Selaa ja hallinnoi Alkon tuotteita sisältäviä listoja.',
			og: {
				title: data.list ? `Lista - ${data.list.name}` : 'Listat',
				url: window.location.href,
				description: data.list
					? `Katso lista "${data.list.name}" Alkometriikassa.`
					: 'Selaa ja hallinnoi Alkon tuotteita sisältäviä listoja.'
			}
		});
	});
</script>

<svelte:head>
	<title>{data.list ? generateTitle(`Lista - ${data.list.name}`) : generateTitle('Listat')}</title>
</svelte:head>

{#await data.alko}
	<div class="grid h-full w-full place-content-center">
		<div class="flex flex-col items-center gap-3">
			<span
				class="block h-16 w-16 animate-spin rounded-full border-[0.5rem] border-red-600 border-b-transparent"
			></span>
			<p>Ladataan...</p>
		</div>
	</div>
{:then alko}
	{#if data.list}
		<List dataset={alko.dataset.table} list={data.list} />
	{:else}
		<div class={twMerge('mx-auto flex w-[min(80ch,_100%)] flex-col gap-4 p-4')}>
			<div class="flex w-full items-center gap-4">
				<button
					onclick={() => window.history.back()}
					class={twMerge(components.button({ size: 'md' }))}
				>
					<Icon name="arrow_back" class="inline-block" />
					<span>Takaisin</span>
				</button>
			</div>
			<div class="flex flex-auto flex-col items-center gap-4">
				<AllLists useSearch={true} show={{ delete: true, share: true }} />
			</div>
		</div>
	{/if}
{/await}
