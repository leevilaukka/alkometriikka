<script lang="ts">
	import { hideToast, toast } from '$lib/utils/app/toast.svelte';
	import Icon from './Icon.svelte';
</script>

<!-- Always in the page, so screen readers announce the messages put in it -->
<div
	role="status"
	aria-live="polite"
	class="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-4"
>
	{#if toast.current}
		<div
			class="pointer-events-auto flex max-w-full items-center gap-3 rounded border border-primary bg-primary px-4 py-2.5 text-sm shadow-lg transition-opacity starting:opacity-0"
		>
			<Icon name="check" class="shrink-0 text-green-700 dark:text-green-400" />
			<span>{toast.current.text}</span>
			{#if toast.current.href}
				<a href={toast.current.href} class="font-semibold underline" onclick={hideToast}>
					{toast.current.linkText ?? 'Avaa'}
				</a>
			{/if}
			<button
				type="button"
				class="-me-1 shrink-0 p-1 text-secondary hover:cursor-pointer"
				onclick={hideToast}
				aria-label="Sulje"
			>
				<Icon name="x" />
			</button>
		</div>
	{/if}
</div>
