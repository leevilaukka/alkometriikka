<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../widgets/Icon.svelte';

	/** A collapsible block of the category sidebar, closed by default to keep the sidebar short. */
	const {
		title,
		hint,
		open = false,
		children
	}: { title: string; hint?: string; open?: boolean; children: Snippet } = $props();
</script>

<!-- Named groups, so hovering the section doesn't trigger the `group-hover` links inside it -->
<details class="group/section border-b border-primary first:border-t" {open}>
	<!-- Only the title is underlined on hover, not the count or the arrow -->
	<summary
		class="group/summary flex cursor-pointer list-none items-center gap-2 py-2.5 text-sm font-bold"
	>
		<span class="flex-1 group-hover/summary:underline">{title}</span>
		{#if hint}
			<span class="text-xs font-normal text-secondary">{hint}</span>
		{/if}
		<Icon name="chevron_down" class="shrink-0 transition-transform group-open/section:rotate-180" />
	</summary>
	<div class="flex flex-col gap-2 pb-3">
		{@render children()}
	</div>
</details>
