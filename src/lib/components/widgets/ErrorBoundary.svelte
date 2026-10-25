<script lang="ts">
	import { m } from '$lib/i18n';
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/ui/styles';
	import Icon from './Icon.svelte';
	import { reportError } from '$lib/utils/app/errorAnalytics';

	let {
		children,
		name,
		label,
		fallback = 'silent',
		resetKey,
		class: className
	}: {
		children: Snippet;
		/** Which part of the app this guards, sent with the error report */
		name: string;
		/**
		 * `silent` (the default) drops the failed part, for extras the page works without. `section`
		 * leaves a notice with a retry for content a visitor would miss, and `page` is for a route.
		 */
		fallback?: 'silent' | 'section' | 'page';
		/** What the `section` notice says couldn't be shown, such as "Myymälälista" */
		label?: string;
		/** Tries again when this changes, such as the path, so a failure doesn't outlive its page */
		resetKey?: unknown;
		class?: string;
	} = $props();

	let reset: (() => void) | undefined;

	$effect(() => {
		resetKey;
		const retry = reset;
		reset = undefined;
		retry?.();
	});

	function handleError(error: unknown, retry: () => void) {
		console.error(error);
		reset = retry;
		reportError('boundary', error, { route: name });
	}
</script>

<svelte:boundary onerror={handleError}>
	{@render children()}
	{#snippet failed(_error, retry)}
		{#if fallback === 'page'}
			<div class="grid h-full w-full place-content-center p-6">
				<div role="alert" class="flex flex-col items-center gap-3 text-center">
					<Icon name="alert_triangle" class="text-4xl text-amber-600 dark:text-amber-400" />
					<h2 class="text-xl font-bold">{m.error_page_title()}</h2>
					<p class="text-secondary">{m.error_rest_works()}</p>
					<div class="flex gap-2">
						<button type="button" class={components.button({ size: 'md' })} onclick={retry}>
							{m.common_retry()}
						</button>
						<button
							type="button"
							class={components.button({ size: 'md' })}
							onclick={() => location.reload()}
						>
							{m.error_reload_page()}
						</button>
					</div>
				</div>
			</div>
		{:else if fallback === 'section'}
			<div
				role="alert"
				class={twMerge(
					'flex items-center gap-3 rounded border border-primary bg-secondary px-4 py-3 text-sm',
					className
				)}
			>
				<Icon name="alert_triangle" class="shrink-0 text-lg text-amber-600 dark:text-amber-400" />
				<p class="flex-1">
					{label ? m.error_section_named({ label }) : m.error_section()}
				</p>
				<button type="button" class="shrink-0 font-semibold underline" onclick={retry}>
					{m.common_retry()}
				</button>
			</div>
		{/if}
	{/snippet}
</svelte:boundary>
