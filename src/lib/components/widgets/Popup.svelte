<script lang="ts">
	let dialogElement: HTMLDialogElement | undefined = $state();

	let { renderContent, renderButton = () => {} } = $props();
</script>

{@render renderButton(dialogElement)}
<dialog
	open={false}
	bind:this={dialogElement}
	class="m-auto w-[min(80ch,_100%)] flex-col gap-4 rounded-lg border border-gray-300 p-4 backdrop:backdrop-blur-sm open:flex"
	closedby="any"
>
	{@render renderContent(dialogElement)}
</dialog>
