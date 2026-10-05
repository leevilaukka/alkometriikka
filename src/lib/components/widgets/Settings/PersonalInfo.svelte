<script lang="ts">
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';
	import { personalInfo, locationDenied, preferredStoreId, userLocation } from '$lib/global.svelte';
	import { AUTO_STORE_ID, GenderOptionsMap } from '$lib/utils/constants';
	import { sendAnalyticsEvent } from '$lib/utils/helpers';
	import { getStoreCity, resolvePreferredStore } from '$lib/utils/availability';
	import { requestUserLocation } from '$lib/utils/location';
	import type { AvailabilityStore } from '$lib/types';
	let { dialogElement, stores }: { dialogElement: HTMLDialogElement; stores: AvailabilityStore[] } = $props();

    const nearestStore = $derived(
        $preferredStoreId === AUTO_STORE_ID
            ? resolvePreferredStore(
                  Object.fromEntries(stores.map((store) => [store.id, store])),
                  AUTO_STORE_ID,
                  $userLocation
              )
            : undefined
    );
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
            if ($preferredStoreId === AUTO_STORE_ID) {
                requestUserLocation();
                sendAnalyticsEvent('preferred_store_changed', { storeId: AUTO_STORE_ID, storeName: 'Auto' });
                return;
            }
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
        <option value={AUTO_STORE_ID}>Automaattinen (lähin myymälä)</option>
        {#each stores as store (store.id)}
            <option value={store.id}>{store.name}</option>
        {/each}
    </select>
    {#if $preferredStoreId === AUTO_STORE_ID}
        <p class="text-xs text-secondary">
            {#if $locationDenied}
                Sijaintilupa on estetty. Salli sijainti selaimen asetuksista
                {nearestStore ? `päivittääksesi lähimmän myymälän. Käytetään viimeksi tallennettua sijaintia: ${nearestStore.name}.` : 'jotta lähin myymälä voidaan valita.'}
            {:else if nearestStore}
                Lähin myymälä: <strong>{nearestStore.name}</strong>. Sijaintia käytetään vain laitteellasi.
            {:else}
                Odotetaan sijaintilupaa. Salli sijainti selaimesta, jotta lähin myymälä voidaan valita.
            {/if}
        </p>
    {/if}
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