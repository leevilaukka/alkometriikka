<script lang="ts">
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';
	import Popup from '$lib/components/widgets/Popup.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import type { IconName } from '$lib/icons';

	let {
		triggerLabel = 'Palaute',
		triggerIcon = 'bug',
		triggerClass = '',
		dialogClass = '',
		title,
		description,
		thankYou = 'Kiitos ilmoituksesta!',
		categories,
		onSubmit
	}: {
		triggerLabel?: string;
		triggerIcon?: IconName;
		triggerClass?: string;
		dialogClass?: string;
		title: string;
		description: string;
		thankYou?: string;
		categories: readonly { key: string; label: string }[];
		onSubmit: (selected: Record<string, boolean>) => void | Promise<void>;
	} = $props();

	function emptySelection() {
		return Object.fromEntries(categories.map((category) => [category.key, false]));
	}

	let dialogElement: HTMLDialogElement | undefined = $state();
	let selected = $state<Record<string, boolean>>(emptySelection());
	let sending = $state(false);
	let sent = $state(false);

	const anySelected = $derived(Object.values(selected).some(Boolean));

	function reset() {
		selected = emptySelection();
		sent = false;
	}

	async function submit() {
		if (!anySelected || sending) return;
		sending = true;
		await onSubmit(selected);
		sending = false;
		sent = true;
	}
</script>

<Popup bind:dialogElement class={twMerge('w-[min(50ch,100%)] gap-4 p-4', dialogClass)} onClose={reset}>
	{#snippet renderButton(dialogElement: HTMLDialogElement)}
		<button
			class={twMerge(components.button(), triggerClass)}
			onclick={() => dialogElement?.showModal()}
			aria-label="Lähetä palautetta"
		>
			<span class="flex items-center gap-2"><Icon name={triggerIcon} />{triggerLabel}</span>
		</button>
	{/snippet}
	{#snippet renderContent(dialogElement: HTMLDialogElement)}
		<div class="flex flex-col gap-4">
			<div class="flex items-center justify-between gap-4">
				<h2 class="text-lg font-bold">{title}</h2>
				<button
					onclick={() => dialogElement?.close()}
					class={twMerge(components.button({ type: 'noborder' }))}
				>
					<Icon name="x" />
				</button>
			</div>
			{#if sent}
				<p class="text-secondary">{thankYou}</p>
				<button
					class={twMerge(components.button({ type: 'negative' }), 'self-end px-4 py-2')}
					onclick={() => dialogElement?.close()}
				>
					Sulje
				</button>
			{:else}
				<p class="text-sm text-secondary">{description}</p>
				<div class="flex flex-col gap-2">
					{#each categories as category (category.key)}
						<label class={twMerge(components.button(), 'w-full justify-start gap-2')}>
							<Icon
								name={selected[category.key] ? 'checkbox_checked' : 'checkbox'}
								class={selected[category.key] ? 'text-brand-1' : 'text-secondary'}
							/>
							<span>{category.label}</span>
							<input type="checkbox" class="sr-only" bind:checked={selected[category.key]} />
						</label>
					{/each}
				</div>
				<button
					class={twMerge(components.button({ type: 'negative', size: 'md' }), 'justify-center px-4 py-2')}
					disabled={!anySelected || sending}
					onclick={submit}
				>
					{sending ? 'Lähetetään…' : 'Lähetä palaute'}
				</button>
			{/if}
		</div>
	{/snippet}
</Popup>
