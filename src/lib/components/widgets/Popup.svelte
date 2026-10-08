<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { twMerge } from 'tailwind-merge';

	let {
		dialogElement = $bindable(),
		renderContent,
		renderButton,
		onOpen = (dialogElement: HTMLDialogElement) => {},
		onClose = (dialogElement: HTMLDialogElement) => {},
		...rest
	} = $props();

	let headingCounter = 0;

	// Name the dialog after its first heading so screen readers announce what opened.
	function labelDialog(dialog: HTMLDialogElement) {
		if (dialog.hasAttribute('aria-label') || dialog.hasAttribute('aria-labelledby')) return;
		const heading = dialog.querySelector<HTMLElement>('h1, h2, h3');
		if (!heading) return;
		if (!heading.id)
			heading.id = `dialog-title-${Math.random().toString(36).slice(2)}-${headingCounter++}`;
		dialog.setAttribute('aria-labelledby', heading.id);
	}

	onMount(() => {
		if (!dialogElement) return;

		const mutationObserver = new MutationObserver((event) => {
			const dialog = event[0].target as HTMLDialogElement;
			if (!dialog) return;
			const open = dialog.hasAttribute('open');
			if (open) {
				labelDialog(dialog);
				onOpen(dialogElement);
			}
		});

		mutationObserver.observe(dialogElement, { attributes: true });
		dialogElement.addEventListener('close', () => {
			onClose(dialogElement);
		});
	});

	onDestroy(() => {
		onClose();
	});
</script>

{@render renderButton(dialogElement)}
<dialog
	open={false}
	bind:this={dialogElement}
	class={twMerge(
		'm-auto w-[min(80ch,_100%)] flex-col rounded-lg border border-primary bg-primary transition-transform backdrop:backdrop-blur-sm open:flex open:scale-100 open:starting:scale-0',
		rest.class
	)}
	closedby="any"
>
	{@render renderContent(dialogElement)}
</dialog>
