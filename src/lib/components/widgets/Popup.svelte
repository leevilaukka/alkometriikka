<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { twMerge } from "tailwind-merge";

	let { dialogElement = $bindable(), renderContent, renderButton, onopen = (dialogElement: HTMLDialogElement) => {}, onclose = (dialogElement: HTMLDialogElement) => {}, ...rest } = $props();

	onMount(() => {
		if(!dialogElement) return;

		const mutationObserver = new MutationObserver((event) => {
			const dialog = event[0].target as HTMLDialogElement;
			if(!dialog) return
			const open = dialog.hasAttribute("open");
			if(open) onopen(dialogElement)
		})

		mutationObserver.observe(dialogElement, { attributes: true })
		dialogElement.addEventListener("close", () => { onclose(dialogElement) })
	})

	onDestroy(() => {
		onclose();
	})
</script>

{@render renderButton(dialogElement)}
<dialog
	open={false}
	bind:this={dialogElement}
	class={twMerge("m-auto w-[min(80ch,_100%)] flex-col rounded-lg border border-gray-300 backdrop:backdrop-blur-sm open:flex", rest.class)}
	closedby="any"
>
	{@render renderContent(dialogElement)}
</dialog>
