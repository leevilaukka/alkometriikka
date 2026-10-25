<script lang="ts">
	import type { IconName } from '$lib/icons';
	import { twMerge } from 'tailwind-merge';

	const { name, class: _class = '' }: { name: IconName; class?: string } = $props();
</script>

<span aria-hidden="true" class={twMerge('icon', _class)}>{name}</span>

<style>
	.icon {
		user-select: none;
		font-family: 'icons';
		line-height: 1em;
		display: grid;
		place-content: center;
		/* Until the font loads the icon's name shows as plain text, which would widen
		   the icon and shift the layout, so keep the box one glyph wide and clip it */
		width: 1em;
		height: 1em;
		min-width: 1em;
		min-height: 1em;
		overflow: hidden;
		transform: scale(1.15);
	}
</style>
