<script lang="ts">
	import { appPath } from '$lib/utils/app/paths';
	import { lists, searchQuery } from '$lib/global.svelte';
	import { createList, deleteList, listToURI } from '$lib/utils/user/lists';
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import Icon from './Icon.svelte';
	import type { ListObj } from '$lib/types';
	import { isSimilarString } from '$lib/utils/catalog/search';
	import { handleShare } from '$lib/utils/app/share';
	import { showToast } from '$lib/utils/app/toast.svelte';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';

	const {
		action,
		show,
		useSearch = false
	}: {
		action?: (list: ListObj) => void;
		show?: { delete?: boolean; length?: boolean; share?: boolean };
		useSearch?: boolean;
	} = $props();
	const time = new Date();

	function handleCreateList() {
		createList(
			`Uusi lista - ${time.getDate()}.${time.getMonth() + 1}.${time.getFullYear()} ${time.getHours() < 10 ? '0' : ''}${time.getHours()}.${time.getMinutes() < 10 ? '0' : ''}${time.getMinutes()}`
		);
		sendAnalyticsEvent('create_list');
	}
</script>

<div
	class={twMerge(
		'flex w-[min(80ch,_100%)] flex-col gap-4',
		lists.length === 0 && 'h-full justify-center'
	)}
>
	{#if lists.length > 0}
		<div class="flex flex-col gap-4">
			{#each lists.filter((list) => {
				return useSearch && $searchQuery ? isSimilarString(list.name, $searchQuery) : true;
			}) as list}
				<div
					class="relative flex items-center justify-between gap-2 rounded border border-primary p-2 focus-within:outline-1 focus-within:outline-brand-1 hover:bg-secondary"
				>
					<div class="flex flex-col">
						<a
							href={appPath(`/listat/?list=${listToURI(list)}`)}
							class="text-lg after:absolute after:inset-0 focus-visible:outline-none"
							onclick={(e) => {
								if (action && typeof action === 'function') {
									e.preventDefault();
									action(list);
								}
							}}>{list.name}</a
						>
						<p class="w-full justify-start text-sm text-secondary">
							{`Tuotteet: ${list.items.length}`}
						</p>
					</div>
					<div class="flex items-center gap-3">
						{#if show?.share}
							<button
								class={twMerge(
									components.button({ type: 'positive', size: 'md' }),
									'relative aspect-square md:aspect-auto'
								)}
								onclick={async (e) => {
									e.preventDefault();
									e.stopPropagation();
									const anchor = e.currentTarget;
									const shared = await handleShare({
										title: `Alkometriikka - ${list.name}`,
										text: `Katso lista: ${list.name}`,
										url: `${location.origin}/listat/?list=${listToURI(list)}`,
										includeSID: true
									});

									if (!shared) showToast({ text: 'Linkki kopioitu leikepöydälle', anchor });
								}}
							>
								<Icon name="share" /><span class="sr-only md:not-sr-only">Jaa</span>
							</button>
						{/if}
						{#if show?.delete}
							<button
								onclick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									deleteList(list);
								}}
								aria-label={`Poista lista ${list.name}`}
								class={twMerge(
									components.button({ type: 'negative', size: 'md' }),
									'relative aspect-square w-fit'
								)}
							>
								<Icon name="trash" />
							</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="mx-auto prose text-center dark:prose-invert">
			<h2>Ei listoja!</h2>
			<p>Luo uusi lista alla olevasta painikkeesta!</p>
		</div>
	{/if}
	<button
		onclick={() => handleCreateList()}
		class={twMerge(components.button({ type: 'positive' }), 'mx-auto w-full')}
		><span>Uusi lista</span><Icon name="plus" /></button
	>
</div>
