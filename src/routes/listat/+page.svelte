<script lang="ts">
	import { locale, m } from '$lib/i18n';
	import List from '$lib/components/views/List.svelte';
	import AllLists from '$lib/components/widgets/AllLists.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { staticPage } from '$lib/utils/app/seo';
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';

	const { data } = $props();
	const { description: DESCRIPTION } = staticPage('/listat/', locale);

	$effect(() => {
		const description = data.list ? m.list_seo_description({ name: data.list.name }) : DESCRIPTION;
		setSEO({
			description,
			og: {
				title: data.list ? m.list_page_title({ name: data.list.name }) : m.nav_lists(),
				url: window.location.href,
				description
			}
		});
	});
</script>

<svelte:head>
	<title
		>{generateTitle(data.list ? m.list_page_title({ name: data.list.name }) : m.nav_lists())}</title
	>
</svelte:head>

{#await data.alko}
	<div class="grid h-full w-full place-content-center">
		<div class="flex flex-col items-center gap-3">
			<span
				class="block h-16 w-16 animate-spin rounded-full border-[0.5rem] border-red-600 border-b-transparent"
			></span>
			<p>{m.common_loading()}</p>
		</div>
	</div>
{:then alko}
	{#if data.list}
		<List kaljakori={alko.kaljakori} list={data.list} />
	{:else}
		<div class={twMerge('mx-auto flex w-[min(80ch,_100%)] flex-col gap-4 p-4')}>
			<div class="flex w-full items-center gap-4">
				<button
					onclick={() => window.history.back()}
					class={twMerge(components.button({ size: 'md' }))}
				>
					<Icon name="arrow_back" class="inline-block" />
					<span>{m.common_back()}</span>
				</button>
			</div>
			<div class="flex flex-auto flex-col items-center gap-4">
				<AllLists useSearch={true} show={{ delete: true, share: true }} />
			</div>
		</div>
	{/if}
{/await}
