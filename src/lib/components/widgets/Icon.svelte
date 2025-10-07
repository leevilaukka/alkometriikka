<script lang="ts">
	import type { IconName } from "$lib/icons";
    import { twMerge } from "tailwind-merge";

    const { name, class: _class = "" }: { name: IconName; class?: string } = $props();
</script>

<span class={twMerge("icon", _class)}>{name}</span>

<style>
    .icon {
        user-select: none;
        font-family: "icons";
        font-size: 1em;
        line-height: 1em;
        display: grid;
        place-content: center;
        min-width: 1em;
        min-height: 1em;
        transform: scale(1.15);
    }
</style>