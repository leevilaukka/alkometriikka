<script lang="ts">
	import { appPath } from '$lib/utils/app/paths';
	import { resolve } from '$app/paths';
	import type { BreadcrumbItem } from '$lib/types';
	import Icon from './Icon.svelte';
	import { twMerge } from 'tailwind-merge';
	import { m } from '$lib/i18n';

	const {
		items,
		current,
		class: _class = ''
	}: {
		items: BreadcrumbItem[];
		/** Label of the current page, hidden on small screens. */
		current?: string;
		class?: string;
	} = $props();
</script>

<nav
	class={twMerge('flex min-w-0 items-center gap-2 overflow-hidden text-sm text-secondary', _class)}
>
	<a
		href={resolve('/')}
		class="flex shrink-0 items-center gap-1 hover:text-black dark:hover:text-white"
	>
		<Icon name="home" class="text-base" />
		<span class="hidden sm:inline">{m.breadcrumb_home()}</span>
	</a>
	{#each items as item}
		<Icon name="chevron_right" />
		{#if item.href}
			<a href={appPath(item.href)} class="shrink-0 hover:text-black dark:hover:text-white"
				>{item.label}</a
			>
		{:else}
			<span class="shrink-0">{item.label}</span>
		{/if}
	{/each}
	{#if current}
		<Icon name="chevron_right" class="hidden sm:block" />
		<span class="hidden truncate text-black sm:inline dark:text-white">{current}</span>
	{/if}
</nav>
