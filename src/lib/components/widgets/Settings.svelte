<script lang="ts">
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';
	import { isLaptop, isMobile, personalInfo, preferredStoreId, theme } from '$lib/global.svelte';
	import { GenderOptionsMap, LocalStorageKeys } from '$lib/utils/constants';
	import Popup from '$lib/components/widgets/Popup.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { version } from '$app/environment';
	import { handleClearAll, handleExport, handleImport, sendAnalyticsEvent } from '$lib/utils/helpers';
	import type { AvailabilityStore } from '$lib/types';
	import { onSettingsOpenRequested } from '$lib/utils/settings';
	import { onMount } from 'svelte';
	import { getStoreCity } from '$lib/utils/availability';
	import { getFriendlyNameForStorageKey, LocalStorageManager, persistentExportKeys, type LocalStorageKey } from '$lib/utils/storage';

	let tab = $state<'personal' | 'info' | 'settings'>('personal');
	let dialogElement: HTMLDialogElement | undefined = $state();

	const gitCommitHash = version.substring(0, 7);

	function openSettings() {
		tab = 'personal';
		sendAnalyticsEvent('open_settings');
		if (dialogElement && !dialogElement.open) dialogElement.showModal();
	}

	onMount(() => onSettingsOpenRequested(openSettings));

	const { alko }: { alko: any } = $props();
	const stores = $derived(
		(Object.values(alko.availability.stores) as AvailabilityStore[]).sort((a, b) =>
			a.name.localeCompare(b.name, 'fi', { sensitivity: 'base' })
		)
	);

	let selectedKeys = $state<string[]>(Object.values(LocalStorageKeys));

	const timeConfig: Intl.DateTimeFormatOptions = {
		hour: '2-digit',
		minute: '2-digit',
		timeZone: 'Europe/Helsinki',
	};

	const githubBase = 'https://github.com/leevilaukka/alkometriikka';
</script>

<Popup bind:dialogElement class="gap-4 p-4">
	{#snippet renderButton(dialogElement: HTMLDialogElement)}
		<button
			class={twMerge(components.button(), 'p-2 text-xl')}
			onclick={openSettings}
		>
			{#if !$isMobile}<span class="text-sm">Asetukset</span>{/if}<Icon name="cog" />
		</button>
	{/snippet}
	{#snippet renderContent(dialogElement: HTMLDialogElement)}
		<div class="flex flex-row gap-2">
			<label
				for="personal"
				class={twMerge(components.button(), 'w-full', 'has-checked:bg-secondary')}
			>
				<input
					type="radio"
					id="personal"
					name="tab"
					class="hidden"
					value="personal"
					bind:group={tab}
				/>
				<Icon name="user" />
				{#if !$isMobile}<span class="text-sm">Henkilökohtaiset tiedot</span>{/if}
			</label>
			<label
				for="settings"
				class={twMerge(components.button(), 'w-full', 'has-checked:bg-secondary')}
			>
				<input
					type="radio"
					id="settings"
					name="tab"
					class="hidden"
					value="settings"
					bind:group={tab}
				/>
				<Icon name="cog" />
				{#if !$isMobile}<span class="text-sm">Lisäasetukset</span>{/if}
			</label>
			<label for="info" class={twMerge(components.button(), 'w-full', 'has-checked:bg-secondary')}>
				<input type="radio" id="info" name="tab" class="hidden" value="info" bind:group={tab} />
				<Icon name="info_circle" />
				{#if !$isMobile}<span class="text-sm">Tietoa</span>{/if}
			</label>
		</div>
		{#if tab === 'info'}
			<div class="prose dark:prose-invert">
				<h2 class="text-lg font-bold">Tietoa</h2>
				<p>
					Alkometriikka on
					<a href={githubBase} target="_blank">
						avoimen lähdekoodin
					</a> web-sovellus, joka listaa Alkon tuotevalikoiman ja antaa käyttäjille hieman laskennallista
					tietoa tuotteista.
				</p>
				<p>
					Voit lähettää kehitysehdotuksia ja bugiraportteja GitHubin kautta. <br />
					<a
						href={`${githubBase}/issues/new?template=feature_request.md`}
						>Lähetä kehitysehdotus
					</a>
					|
					<a href={`${githubBase}/issues/new?template=bug_report.md`}
						>Lähetä bugiraportti
					</a>
				</p>
				<p>
					Muut yhteydenotot voi lähettää sähköpostitse osoitteeseen
					<a href="mailto:contact@alkometriikka.fi">contact@alkometriikka.fi</a>.
				</p>
				<details>
					<summary class="cursor-pointer">Tietolähteet</summary>
					<p>
						Tuotevalikoima ladataan Alkon rajapinnoista. Tiedostoa päivitetään noin
						kuuden tunnin välein. Voit ladata Alkometriikan käyttämän tiedoston <a
							href={`${githubBase}/blob/gh-pages/data.json`}
							target="_blank"
							>täältä
						</a>.
					</p>
					<p>
						Valikoiman "poistuneet tuotteet" perustuvat Alkometriikan aiemmin keräämiin tietoihin. Tiedot eivät siis sisällä kautta aikojen kaikkia poistuneita tuotteita, vaan vain ne, jotka on kerätty ennen tuotteen poistumista valikoimasta. Tämän vuoksi tietoa ei voi pitää täysin luotettavana.
					</p>
				</details>
			</div>
			<div class="flex flex-row items-center gap-2">
				<a
					href={githubBase}
					target="_blank"
					class={twMerge(components.button())}
				>
					<Icon name="github" class="inline-block" />
					<span>GitHub</span>
				</a>
				<a
					href="mailto:contact@alkometriikka.fi"
					target="_blank"
					class={twMerge(components.button())}
				>
					<Icon name="mail_send" class="inline-block" />
					<span>Sähköposti</span>
				</a>
			</div>
			<p class="text-sm text-secondary">
				Versio: <a href={`${githubBase}/commit/${version}`} target="_blank">
					{gitCommitHash}
				</a>
				{#if alko.dataset.metadata.LastUpdated && alko.dataset.metadata.LastSynced}
					<br />
				{@const lastSynced = `${new Date(alko.dataset.metadata.LastSynced).toLocaleDateString('fi-FI')} klo ${new Date(alko.dataset.metadata.LastSynced).toLocaleTimeString('fi-FI', timeConfig)}`}
				{@const lastUpdated = `${new Date(alko.dataset.metadata.LastUpdated).toLocaleDateString('fi-FI')} klo ${new Date(alko.dataset.metadata.LastUpdated).toLocaleTimeString('fi-FI', timeConfig)}`}
				{@const {sync, update} = alko.dataset.metadata.ci}
					Viimeisin synkronointi: 
					{#if sync.workflowRun}
						<a href={sync.workflowRun} target="_blank">{lastSynced}</a>
					{:else}
						{lastSynced}
					{/if}
					| Viimeisin muutos: 
					{#if update.workflowRun}
						<a href={update.workflowRun} target="_blank">{lastUpdated}</a>
					{:else}
						{lastUpdated}
					{/if}
				{/if}
			</p>
			<button class={twMerge(components.button(), 'w-full')} onclick={() => dialogElement.close()}
				>Sulje</button
			>
		{:else if tab === 'settings'}
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
		{:else if tab === 'personal'}
			{@const weightOK = personalInfo.weight == null || personalInfo.weight >= 1}
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
		{/if}
	{/snippet}
</Popup>
