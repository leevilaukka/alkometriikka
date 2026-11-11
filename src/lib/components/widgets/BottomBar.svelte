<script lang="ts">
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	/** Mobile action bar shell, rendered at the bottom of the screen through the layout's `pageBottomBar`. */
	const { children, class: _class = '' }: { children: Snippet; class?: string } = $props();
</script>

<div
	class={twMerge(
		'flex items-center gap-2.5 border-t border-primary bg-primary px-4 py-2.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]',
		_class
	)}
>
	{@render children()}
</div>
