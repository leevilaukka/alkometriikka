<script lang="ts">
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/ui/styles';
	import AddToListContent from './AddToListContent.svelte';
	import Icon from './Icon.svelte';
	import Popup from './Popup.svelte';

	/** "Lisää" and its popup (lists and the punch); the one add button every product surface uses */
	const {
		productNumber,
		type = 'positive',
		size = 'sm',
		compact = false,
		class: _class = ''
	}: {
		productNumber: string;
		type?: 'primary' | 'positive';
		size?: 'xs' | 'sm' | 'md' | 'lg';
		/** Icon only below the `sm` breakpoint, for the phone's bottom bar */
		compact?: boolean;
		class?: string;
	} = $props();
</script>

<Popup class="gap-4 p-4">
	{#snippet renderButton(dialogElement: HTMLDialogElement)}
		<button
			type="button"
			class={twMerge(components.button({ type, size }), _class)}
			aria-label="Lisää listaan tai booliin"
			aria-haspopup="dialog"
			onclick={() => dialogElement.showModal()}
		>
			<span class={compact ? 'hidden sm:inline' : undefined}>Lisää</span>
			<Icon name="plus" />
		</button>
	{/snippet}
	{#snippet renderContent(dialogElement: HTMLDialogElement)}
		<AddToListContent {productNumber} onadded={() => dialogElement.close()} />
	{/snippet}
</Popup>
