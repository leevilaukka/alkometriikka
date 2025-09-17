<script>
    import { twMerge } from "tailwind-merge";

    const { name, class: _class = "" } = $props();
</script>

<span class={twMerge("icon", _class)}>{name}</span>

<style>
    .icon {
        user-select: none;
        font-family: "feather";
        font-size: 1em;
        line-height: 1em;
        display: grid;
        place-content: center;
        min-width: 1em;
        min-height: 1em;
    }
</style>