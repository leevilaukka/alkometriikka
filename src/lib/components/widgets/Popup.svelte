<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { twMerge } from "tailwind-merge";

	let { dialogElement = $bindable(), renderContent, renderButton, onOpen = (dialogElement: HTMLDialogElement) => {}, onClose = (dialogElement: HTMLDialogElement) => {}, ...rest } = $props();

	onMount(() => {
		if(!dialogElement) return;

		const mutationObserver = new MutationObserver((event) => {
			const dialog = event[0].target as HTMLDialogElement;
			if(!dialog) return
			const open = dialog.hasAttribute("open");
			if(open) onOpen(dialogElement)
		})

		mutationObserver.observe(dialogElement, { attributes: true })
		dialogElement.addEventListener("close", () => { onClose(dialogElement) })
	})

	onDestroy(() => {
		onClose();
	})
</script>

{@render renderButton(dialogElement)}
<dialog
	open={false}
	bind:this={dialogElement}
	class={twMerge("bg-primary m-auto w-[min(80ch,_100%)] flex-col rounded-lg border border-primary backdrop:backdrop-blur-sm open:flex transition open:starting:scale-0 open:scale-100", rest.class)}
	closedby="any"
>
	{@render renderContent(dialogElement)}
</dialog>