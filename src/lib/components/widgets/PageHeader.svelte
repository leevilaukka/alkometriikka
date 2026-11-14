<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { BreadcrumbItem } from '$lib/types';
	import Breadcrumb from './Breadcrumb.svelte';

	const {
		title,
		crumbs = [],
		description,
		actions,
		children
	}: {
		title: string;
		/** Pages between Etusivu and this one */
		crumbs?: BreadcrumbItem[];
		description?: string;
		/** Buttons on the title's row, so they take no row of their own on phones */
		actions?: Snippet;
		/** Anything under the description */
		children?: Snippet;
	} = $props();
</script>

<!-- The standalone pages' shared top: breadcrumb, title and description, in the page's flex column -->
<Breadcrumb items={crumbs} current={title} />
<header class="flex flex-col gap-2">
	<div class="flex items-center justify-between gap-3">
		<h1 class="text-2xl font-bold md:text-3xl">{title}</h1>
		{#if actions}
			<div class="flex shrink-0 flex-wrap justify-end gap-2">{@render actions()}</div>
		{/if}
	</div>
	{#if description}
		<p class="max-w-2xl text-secondary">{description}</p>
	{/if}
	{@render children?.()}
</header>
