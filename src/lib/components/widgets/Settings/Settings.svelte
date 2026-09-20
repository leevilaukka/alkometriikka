<script lang="ts">
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';
	import { isLaptop, isMobile, theme } from '$lib/global.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { handleClearAll, handleExport, handleImport, sendAnalyticsEvent } from '$lib/utils/helpers';
	import { LocalStorageKeys } from '$lib/utils/constants';
	import { persistentExportKeys, LocalStorageManager, getFriendlyNameForStorageKey } from '$lib/utils/storage';
	import type { LocalStorageKey } from '$lib/utils/storage';

	let { dialogElement } = $props();
	
	let selectedKeys = $state<string[]>(Object.values(LocalStorageKeys));
</script>


<div class="prose dark:prose-invert">
				<h2 class="text-lg font-bold">Lisäasetukset</h2>
			</div>
			<div class="flex flex-col gap-2">
				<p class="text-sm font-bold">Teema</p>
				<div class="flex flex-row gap-0">
					<label
						for="system"
						class={twMerge(components.button(), 'rounded-e-none', 'has-checked:bg-secondary')}
					>
						<input type="radio" id="system" value={''} class="hidden" bind:group={$theme} />
						<Icon name={$isMobile ? 'mobile' : $isLaptop ? 'laptop' : 'desktop'} />
						<span>Järjestelmä</span>
					</label>
					<label
						for="light"
						class={twMerge(
							components.button(),
							'rounded-none border-x-0',
							'has-checked:bg-secondary'
						)}
					>
						<input type="radio" id="light" value={'light'} class="hidden" bind:group={$theme} />
						<Icon name="sun" /> <span>Vaalea</span>
					</label>
					<label
						for="dark"
						class={twMerge(components.button(), 'rounded-s-none', 'has-checked:bg-secondary')}
					>
						<input type="radio" id="dark" value={'dark'} class="hidden" bind:group={$theme} />
						<Icon name="moon" /> <span>Tumma</span>
					</label>
				</div>
			</div>
			<div class="flex flex-col gap-2">
				<p class="text-sm font-bold">Vie / tuo tiedot</p>
				<p class="text-sm text-secondary">
					Tällä voit viedä tai tuoda paikallisesti tallennetut tiedot, kuten henkilökohtaiset tiedot
					ja mukautetut listat. Valitse halutessasi, mitkä tiedot haluat viedä tai tuoda. Tuo-toiminto korvaa nykyiset tiedot tuoduilla tiedoilla.<br>Tiedot tallennetaan JSON-muodossa. 
				</p>
				<div class="flex flex-row gap-2">
				{#each Object.values(LocalStorageKeys) as key}
					{#if persistentExportKeys.includes(key as LocalStorageKey)}
						<!-- Skip Persistent export keys -->
					{:else}
					{@const value = LocalStorageManager.getItem(key)}
					{#if value !== null}
						<label
							for={key}
							class={twMerge(
								components.button({ type: 'primary' }),
								'w-full',
								'has-checked:bg-green-700 dark:has-checked:bg-green-900'
							)}
						>
							<input
								type="checkbox"
								id={key}
								value={key}
								class="hidden"
								bind:group={selectedKeys}
							/>
							<span>{getFriendlyNameForStorageKey(key as LocalStorageKey)}</span>
						</label>
					{/if}
					{/if}
				{/each}
				</div>
				<div class="flex flex-row gap-2">
					<button
						class={twMerge(components.button(), 'w-full', selectedKeys.length === 0 ? 'cursor-not-allowed opacity-50' : '')}
						onclick={() => {
							sendAnalyticsEvent('export_data');
							handleExport(selectedKeys as LocalStorageKey[]);
						}}
						disabled={selectedKeys.length === 0}
					>
						<Icon name="download" /> <span>Vie tiedot</span></button
					>

					<button
						class={twMerge(components.button(), 'w-full')}
						onclick={() => {
							sendAnalyticsEvent('import_data');
							handleImport();
						}}
					>
						<Icon name="upload" /> <span>Tuo tiedot</span></button
					>
				</div>
			</div>
			<div class="flex flex-col gap-2">
				<p class="text-sm font-bold">Tyhjennä tiedot</p>
				<p class="text-sm text-secondary">
					Tämä poistaa kaikki paikallisesti tallennetut tiedot, kuten henkilökohtaiset tiedot ja
					mukautetut listat. Tätä toimintoa ei voi perua.
				</p>
				<button
					class={twMerge(components.button({ type: 'negative' }))}
					onclick={() => {
						handleClearAll();
						dialogElement.close();
					}}
				>
					<Icon name="trash" /> <span>Tyhjennä</span></button
				>
			</div>
			<button class={twMerge(components.button(), 'w-full')} onclick={() => dialogElement.close()}
				>Sulje</button
			>