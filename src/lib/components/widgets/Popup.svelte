<script lang="ts">
	import { twMerge } from "tailwind-merge";

	let dialogElement: HTMLDialogElement | undefined = $state();

	let { renderContent, renderButton = () => {}, ...rest } = $props();
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
