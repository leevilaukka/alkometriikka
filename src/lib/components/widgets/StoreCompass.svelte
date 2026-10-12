<script lang="ts">
	import { onMount } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import CompassDial from '$lib/components/widgets/CompassDial.svelte';
	import Popup from '$lib/components/widgets/Popup.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import type { AvailabilityStore } from '$lib/types';
	import { sendAnalyticsEvent } from '$lib/utils/helpers';
	import { detectCompass, requestOrientationPermission } from '$lib/utils/orientation';
	import { components } from '$lib/utils/styles';

	let { store }: { store: AvailabilityStore } = $props();

	let dialogElement: HTMLDialogElement | undefined = $state();
	let supported = $state(false);
	let open = $state(false);

	async function openCompass(dialog: HTMLDialogElement) {
		// iOS only allows the orientation permission prompt from a tap, so ask before opening.
		await requestOrientationPermission();
		dialog.showModal();
		sendAnalyticsEvent('store_compass_opened', { storeId: store.id, storeName: store.name });
	}

	// Only offer the compass on touch devices that actually report a heading.
	onMount(() => {
		if (typeof store.latitude !== 'number' || typeof store.longitude !== 'number') return;
		detectCompass().then((result) => (supported = result));
	});
</script>

{#if supported}
	<Popup
		bind:dialogElement
		class="w-[min(40ch,100%)] gap-4 p-4"
		onOpen={() => (open = true)}
		onClose={() => (open = false)}
	>
		{#snippet renderButton(dialogElement: HTMLDialogElement)}
			<button
				type="button"
				class={twMerge(
					components.button({ size: 'md' }),
					'w-full justify-center px-3 py-2.5 text-base sm:px-5 sm:py-3 sm:text-lg'
				)}
				onclick={() => openCompass(dialogElement)}
			>
				<Icon name="compass" />
				<span>Kompassi</span>
			</button>
		{/snippet}
		{#snippet renderContent(dialogElement: HTMLDialogElement)}
			<div class="flex flex-col gap-4">
				<div class="flex w-full items-center justify-between gap-4">
					<h2 class="text-lg font-bold">Kompassi: {store.name}</h2>
					<button
						onclick={() => dialogElement?.close()}
						aria-label="Sulje"
						class={twMerge(components.button({ type: 'noborder' }))}
					>
						<Icon name="x" />
					</button>
				</div>
				<CompassDial {store} active={open} />
			</div>
		{/snippet}
	</Popup>
{/if}
