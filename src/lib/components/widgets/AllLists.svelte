<script lang="ts">
    import { lists, searchQuery } from "$lib/global.svelte";
	import { createList, deleteList, listToURI } from "$lib/utils/lists";
	import { components } from "$lib/utils/styles";
	import { twMerge } from "tailwind-merge";
	import Icon from "./Icon.svelte";
	import type { ListObj } from "$lib/types";
	import { isSimilarString } from "$lib/utils/search";
	import { handleShare } from "$lib/utils/helpers";

    const { action, show, useSearch = false }: { action: (list: ListObj) => void; show?: { delete?: boolean, length?: boolean, share?: boolean }, useSearch?: boolean } = $props();
    const time = new Date();

    function handleCreateList() {
        createList(`Uusi lista - ${time.getDate()}.${time.getMonth() + 1}.${time.getFullYear()} ${time.getHours() < 10 ? '0' : ''}${time.getHours()}.${time.getMinutes() < 10 ? '0' : ''}${time.getMinutes()}`);
    }

</script>

<div class={twMerge("flex flex-col gap-4 w-[min(80ch,_100%)]", lists.length === 0 && "h-full justify-center")}>
    {#if lists.length > 0}
        <div class="flex flex-col gap-4">
            {#each lists.filter(list => { return (useSearch && $searchQuery) ? isSimilarString(list.name, $searchQuery) : true }) as list}
                <div class="flex justify-between items-center gap-2 p-2 border rounded border-gray-300" onclick={() => { action(list) }} onkeydown={() => {}} role="link" tabindex="0">
                    <div class="flex flex-col">
                        <p aria-label={list.name} class={twMerge("w-full justify-start text-lg")}>
                            <span>{list.name}</span>
                        </p>
                        <p aria-label={list.name} class={twMerge("w-full justify-start text-gray-600 text-sm")}>
                            <span>{`Tuotteet: ${list.items.length}`}</span>
                        </p>
                    </div>
                    <div class="flex items-center gap-3">
                        {#if show?.share}
                            <button
                                class={twMerge(
                                    components.button({ type: 'positive', size: 'md' }),
                                    'aspect-square md:aspect-auto'
                                )}
                                onclick={async (e) => {
                                    e.stopPropagation();
                                    const shared = await handleShare({
                                        title: `Alkometriikka - ${list.name}`,
                                        text: `Katso lista: ${list.name}`,
                                        url: `${location.origin}/listat?list=${listToURI(list)}`
                                    });

                                    if (!shared) alert('Linkki kopioitu leikepöydälle!');
                                }}
                            >
                                <Icon name="share_2" class="inline-block " /><span class="hidden md:block">Jaa</span>
                            </button>
                        {/if}
                        {#if show?.delete}
                            <button onclick={(e) => { e.stopPropagation(); deleteList(list) }} aria-label={list.name} class={twMerge(components.button({ type: "negative", size: "md" }), "aspect-square w-fit")}>
                                <Icon name="trash" />
                            </button>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    {:else}
        <div class="prose text-center mx-auto">  
            <h2>Ei listoja!</h2>
            <p>Luo uusi lista alla olevasta painikkeesta!</p>
        </div>
    {/if}
    <button onclick={() => handleCreateList()} class={twMerge(components.button({type: "positive"}), "mx-auto w-full")}><span>Uusi lista</span><Icon name="plus" /></button>
</div>