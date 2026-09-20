<script lang="ts">
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';
	import { personalInfo, preferredStoreId } from '$lib/global.svelte';
	import { GenderOptionsMap } from '$lib/utils/constants';
	import { sendAnalyticsEvent } from '$lib/utils/helpers';
	import { getStoreCity } from '$lib/utils/availability';
	import type { AvailabilityStore } from '$lib/types';
	let { dialogElement, stores }: { dialogElement: HTMLDialogElement; stores: AvailabilityStore[] } = $props();

    const weightOK = $derived(personalInfo.weight == null || personalInfo.weight >= 1);
</script>

<div class="prose dark:prose-invert">
    <h2 class="text-lg font-bold">Henkilökohtaiset tiedot</h2>
    <p class="text-sm text-secondary">
        Nämä tiedot vaikuttavat promillearvioihin. Annetut tiedot tallennetaan vain paikallisesti,
        eikä niitä lähetetä mihinkään. Jos et anna tietoja, promillearviot perustuvat
        oletusarvoihin.
    </p>
</div>
<div class="flex flex-row gap-2 w-full">
    <div class="flex flex-col w-full gap-2">
        <label for="weight" class="text-sm">Paino (kg)</label>
        <input
            lang="fi"
            type="number"
            name="weight"
            bind:value={personalInfo.weight}
            placeholder="Paino (kg)"
            class={twMerge(components.input(), 'w-full')}
            min="1"
            max="500"
            step="0.1"
        />
        {#if !weightOK}
            <p class="text-xs text-red-600">Painon tulee olla suurempi kuin 1 kg tai tyhjä.</p>
        {/if}
    </div>
</div>
<div class="flex flex-col">
    <label for="gender" class="text-sm">Sukupuoli</label>
    <select
        name="gender"
        bind:value={personalInfo.gender}
        class={twMerge(components.input(), 'w-full')}
    >
        <option value={null}>Valitse sukupuoli</option>
        {#each Object.values(GenderOptionsMap) as option}
            <option value={option}>{option}</option>
        {/each}
    </select>
</div>
<div class="flex flex-col gap-2 border-t border-primary pt-3">
    <label for="preferred-store" class="text-sm font-bold">Ensisijainen myymälä</label>
    <select
        id="preferred-store"
        name="preferred-store"
        bind:value={$preferredStoreId}
        class={twMerge(components.input(), 'w-full')}
        onchange={() => {
            const selectedStore = stores.find(store => store.id === $preferredStoreId);
            if (selectedStore) {
                sendAnalyticsEvent('preferred_store_changed', {
                    storeId: selectedStore.id,
                    storeName: selectedStore.name,
                    city: getStoreCity(selectedStore),
                });
            }
        }}>
        <option value="">Ei valittua myymälää</option>
        {#each stores as store (store.id)}
            <option value={store.id}>{store.name}</option>
        {/each}
    </select>
    <p class="text-xs text-secondary">
        Tuotesivu näyttää tuotteen saatavuuden valitsemassasi myymälässä.
    </p>
</div>
<p class="self-end text-xs text-secondary">Tallentaminen lataa sivun uudelleen.</p>
<div class="grid grid-cols-2 gap-3">
    <button class={twMerge(components.button(), 'w-full')} onclick={() => dialogElement.close()}
        >Sulje</button
    >
    <button
        class={twMerge(
            components.button({ type: 'positive' }),
            'w-full',
            !weightOK ? 'cursor-not-allowed opacity-50' : ''
        )}
        disabled={!weightOK}
        onclick={() => window.location.reload()}>Tallenna</button
    >
</div>