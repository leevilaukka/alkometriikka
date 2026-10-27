<script lang="ts">
	import {
		hideToast,
		pauseToast,
		resumeToast,
		toast,
		toastDuration
	} from '$lib/utils/app/toast.svelte';
	import type { ToastMessage } from '$lib/utils/app/toast.svelte';
	import { fade } from 'svelte/transition';
	import Icon from './Icon.svelte';

	const GAP = 8;
	const MARGIN = 8;

	let viewportWidth = $state(0);
	let viewportHeight = $state(0);
	let toastWidth = $state(0);

	// The last message stays rendered while the toast fades out, after `toast.current` is cleared
	let message = $state.raw<ToastMessage | null>(null);
	$effect.pre(() => {
		if (toast.current) message = toast.current;
	});

	// Only a toast with a link needs time to be reached; the others just go
	const holdForLink = () => {
		if (message?.href) pauseToast();
	};

	/** Where a toast with an anchor goes: next to the anchor, on the side with more room */
	const placement = $derived.by(() => {
		const anchor = message?.anchor;
		if (!anchor?.isConnected || !viewportWidth) return null;
		const rect = anchor.getBoundingClientRect();
		const half = toastWidth / 2;
		const center = Math.min(
			Math.max(rect.left + rect.width / 2, MARGIN + half),
			viewportWidth - MARGIN - half
		);
		const above = rect.top > viewportHeight - rect.bottom;
		return {
			left: center,
			...(above ? { bottom: viewportHeight - rect.top + GAP } : { top: rect.bottom + GAP })
		};
	});
</script>

<svelte:window bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight} />

<!-- Always in the page, so screen readers announce the messages put in it -->
<div
	role="status"
	aria-live="polite"
	class={placement
		? 'pointer-events-none fixed inset-0 z-50'
		: message?.position === 'top'
			? 'pointer-events-none fixed inset-x-0 top-[10vh] z-50 flex justify-center px-4'
			: 'pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-4'}
>
	{#if toast.current && message}
		<!-- Hover only holds the timer of a toast with a link; the toast's own buttons are what keyboard users reach -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			transition:fade={{ duration: 150 }}
			onmouseenter={holdForLink}
			onmouseleave={resumeToast}
			onfocusin={holdForLink}
			onfocusout={resumeToast}
			bind:clientWidth={toastWidth}
			style:position={placement ? 'absolute' : undefined}
			style:left={placement ? `${placement.left}px` : undefined}
			style:top={placement && 'top' in placement ? `${placement.top}px` : undefined}
			style:bottom={placement && 'bottom' in placement ? `${placement.bottom}px` : undefined}
			style:translate={placement ? '-50% 0' : undefined}
			style:max-width={placement ? `${viewportWidth - MARGIN * 2}px` : undefined}
			class="pointer-events-auto relative flex max-w-full items-center gap-3 overflow-hidden rounded-lg border border-primary bg-primary px-4 py-3 text-base font-medium shadow-xl"
		>
			<Icon name="check" class="shrink-0 text-green-700 dark:text-green-400" />
			<span>{message.text}</span>
			{#if message.href}
				<a href={message.href} class="font-semibold underline" onclick={hideToast}>
					{message.linkText ?? 'Avaa'}
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
			<!-- Runs down in step with the toast's timeout; the key restarts it for a new message -->
			{#key message}
				<div
					class="toast-timer absolute inset-x-0 bottom-0 h-1 bg-brand-1"
					style:animation-duration="{toastDuration(message)}ms"
					style:animation-play-state={toast.paused ? 'paused' : 'running'}
				></div>
			{/key}
		</div>
	{/if}
</div>

<style>
	.toast-timer {
		transform-origin: left;
		animation: toast-timer linear forwards;
	}

	@keyframes toast-timer {
		to {
			transform: scaleX(0);
		}
	}
</style>
