<script lang="ts">
    import { generateTitle } from '$lib/utils/helpers';
    import {page} from '$app/state';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import Icon from '$lib/components/widgets/Icon.svelte';

    document.title = generateTitle(`Error ${page.status}`);
    console.error(page.error);
</script>

<div class="grid place-content-center w-full h-full">
    <div class="flex flex-col items-center gap-4">
        <h1 class="text-red-600 text-5xl">{page.status}</h1>
        <h2 class="text-xl font-bold">Tapahtui virhe</h2>
        
        <p>{page.error?.message}</p>

        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-center"> 
            <a
                href="/"
                class={twMerge(components.button({ size: "md" }))}
            >
                <Icon name="arrow_left" class="inline-block" />
                <span>Palaa etusivulle</span>
            </a>
            
            {#if page.route.id === '/myymalat/[storeID]'}
                <a
                    href="/myymalat"
                    class={twMerge(components.button({ size: "md" }))}
                >
                    <Icon name="map_pin" class="inline-block" />
                    <span>Takaisin myymälälistaan</span>
                </a>
            {/if}
            
        </div>
    </div>  
</div>