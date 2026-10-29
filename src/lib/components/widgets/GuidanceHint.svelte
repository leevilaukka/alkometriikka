<script lang="ts">
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import Icon from './Icon.svelte';
	import type { IconName } from '$lib/icons';
	import { components } from '$lib/utils/ui/styles';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { guidance } from '$lib/utils/app/guidance.svelte';
	import type { GuidanceId } from '$lib/utils/user/guidance';

	const {
		id,
		icon = 'bulb',
		closeLabel,
		children,
		class: _class = ''
	}: {
		id: GuidanceId;
		icon?: IconName;
		/** What the close button closes, for screen readers */
		closeLabel: string;
		children: Snippet;
		class?: string;
	} = $props();

	function dismiss() {
		guidance.dismiss(id);
		sendAnalyticsEvent('dismiss_guidance', { id });
	}
</script>

<!-- Shown once per visitor; whoever renders it decides when it applies -->
<div
	role="note"
	class={twMerge(
		'flex w-full items-start gap-3 rounded border border-primary bg-primary px-3 py-2 text-sm',
		_class
	)}
>
	<Icon name={icon} class="mt-0.5 shrink-0 text-lg text-brand-1" />
	<p class="text-wrap-pretty min-w-0 flex-1">{@render children()}</p>
	<button
		type="button"
		aria-label={closeLabel}
		class={twMerge(components.button({ type: 'noborder' }), 'shrink-0 p-1 text-current')}
		onclick={dismiss}
	>
		<Icon name="x" />
	</button>
</div>
