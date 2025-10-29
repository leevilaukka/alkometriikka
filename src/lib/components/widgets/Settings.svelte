<script lang="ts">
    import { components } from '$lib/utils/styles';
    import { twMerge } from 'tailwind-merge';
    import { isMobile, personalInfo } from '$lib/global.svelte';
    import { GenderOptionsMap } from '$lib/utils/constants';
    import Popup from '$lib/components/widgets/Popup.svelte';
    import Icon from '$lib/components/widgets/Icon.svelte';
    import { version } from '$app/environment';
	import { handleClearAll, handleExport, handleImport } from '$lib/utils/helpers';


	let tab = $state<'personal' | 'info' | 'settings'>('personal');

    const { alko }: { alko: any; } = $props();
</script>
<Popup class="gap-4 p-4">
				{#snippet renderButton(dialogElement: HTMLDialogElement)}
					<button
						class={twMerge(components.button(), 'p-2 text-xl')}
						onclick={() => dialogElement.showModal()}
					>
						{#if !$isMobile}<span class="text-sm">Asetukset</span>{/if}<Icon name="cog" />
					</button>
				{/snippet}
				{#snippet renderContent(dialogElement: HTMLDialogElement)}
					<!-- Tab selector -->
					<div class="mb-2 flex flex-row gap-2 border-b border-gray-300 pb-2">
						<button
							class={twMerge(
								components.button(),
								'w-full',
								tab === 'personal' ? 'bg-gray-200' : ''
							)}
							onclick={() => (tab = 'personal')}
						>
							<Icon name="user" />
							{#if !$isMobile}
								<span class="ms-2">Henkilökohtaiset tiedot</span>
							{/if}
						</button>
						<button
							class={twMerge(
								components.button(),
								'w-full',
								tab === 'settings' ? 'bg-gray-200' : ''
							)}
							onclick={() => (tab = 'settings')}
						>
							<Icon name="cog" />
							{#if !$isMobile}
								<span class="ms-2">Lisäasetukset</span>
							{/if}
						</button>
						<button
							class={twMerge(components.button(), 'w-full', tab === 'info' ? 'bg-gray-200' : '')}
							onclick={() => (tab = 'info')}
						>
							<Icon name="info_circle" />
							{#if !$isMobile}
								<span class="ms-2">Tietoa</span>
							{/if}
						</button>
					</div>
					{#if tab === 'info'}
						<div class="prose">
							<h2 class="text-lg font-bold">Tietoa</h2>
							<p>
								Alkometriikka on
								<a href="https://github.com/leevilaukka/alkometriikka" target="_blank">
									avoimen lähdekoodin
								</a> web-sovellus, joka listaa Alkon tuotevalikoiman ja antaa käyttäjille hieman laskennallista
								tietoa tuotteista.
							</p>
							<p>
								Hinnasto ladataan Alkon julkisesta Excel-tiedostosta. Tiedostoa päivitetään noin
								vuorokauden viiveellä. Voit ladata sen <a
									href="https://www.alko.fi/INTERSHOP/static/WFS/Alko-OnlineShop-Site/-/Alko-OnlineShop/fi_FI/Alkon%20Hinnasto%20Tekstitiedostona/alkon-hinnasto-tekstitiedostona.xlsx"
									target="_blank"
									rel="noopener noreferrer"
									>täältä
								</a>.
							</p>
							<p>
								Voit lähettää kehitysehdotuksia ja bugiraportteja GitHubin kautta. <br />
								<a
									href="https://github.com/leevilaukka/alkometriikka/issues/new?template=feature_request.md"
									>Lähetä kehitysehdotus
								</a>
								|
								<a
									href="https://github.com/leevilaukka/alkometriikka/issues/new?template=bug_report.md"
									>Lähetä bugiraportti
								</a>
							</p>
							<p>
								Muut yhteydenotot voi lähettää sähköpostitse osoitteeseen
								<a href="mailto:alkometriikka@proton.me">alkometriikka@proton.me</a>.
							</p>
						</div>
						<div class="flex flex-row items-center gap-2">
							<a
								href="https://github.com/leevilaukka/alkometriikka"
								target="_blank"
								class={twMerge(components.button())}
							>
								<Icon name="github" class="inline-block" />
								<span>GitHub</span>
							</a>
							<a
								href="mailto:alkometriikka@proton.me"
								target="_blank"
								class={twMerge(components.button())}
							>
								<Icon name="mail_send" class="inline-block" />
								<span>Sähköposti</span>
							</a>
						</div>
						<p class="text-sm text-gray-600">
							Versio: <a href="https://github.com/leevilaukka/alkometriikka/commit/{version}">
								{version}
							</a>
							{#if alko.dataset.metadata.CreatedDate}
								| Hinnaston päiväys: {new Date(
									alko.dataset.metadata.CreatedDate
								).toLocaleDateString('fi-FI')}
							{/if}
						</p>
						<button
							class={twMerge(components.button(), 'w-full')}
							onclick={() => dialogElement.close()}>Sulje</button
						>
					{:else if tab === 'settings'}
						<div class="prose">
							<h2 class="text-lg font-bold">Lisäasetukset</h2>
						</div>
						<div>
							<p>Vie / tuo tiedot</p>
							<p class="text-sm text-gray-600">
								Tällä voit viedä tai tuoda paikallisesti tallennetut tiedot, kuten henkilökohtaiset
								tiedot ja mukautetut listat. Tiedot tallennetaan JSON-muodossa.
							</p>
							<div class="flex flex-row gap-2">
								<button
									class={twMerge(components.button(), 'mt-1')}
									onclick={() => {
										handleExport();
									}}
								>
									<Icon name="download" /> <span>Vie tiedot</span></button
								>

								<button
									class={twMerge(components.button(), 'mt-1')}
									onclick={() => {
										handleImport();
									}}
								>
									<Icon name="upload" /> <span>Tuo tiedot</span></button
								>
							</div>
						</div>
						<div class="flex flex-col gap-2">
							<p class="text-sm font-bold">Tyhjennä tiedot</p>
							<p class="text-sm text-gray-600">
								Tämä poistaa kaikki paikallisesti tallennetut tiedot, kuten henkilökohtaiset tiedot
								ja mukautetut listat. Tätä toimintoa ei voi perua.
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
						<button
							class={twMerge(components.button(), 'w-full')}
							onclick={() => dialogElement.close()}>Sulje</button
						>
					{:else if tab === 'personal'}
						{@const weightOK =
							personalInfo.weight == null ||
							(personalInfo.weight >= 1)}
						<div class="prose">
							<h2 class="text-lg font-bold">Henkilökohtaiset tiedot</h2>
							<p class="text-sm text-gray-600">
								Nämä tiedot vaikuttavat promillearvioihin. Annetut tiedot tallennetaan vain
								paikallisesti, eikä niitä lähetetä mihinkään. Jos et anna tietoja, promillearviot
								perustuvat oletusarvoihin.
							</p>
						</div>
						<div class="flex flex-col">
							<label for="weight" class="text-sm">Paino (kg)</label>
							<input
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
						<p class="self-end text-xs text-gray-600">Tallentaminen lataa sivun uudelleen.</p>
						<div class="grid grid-cols-2 gap-3">
							<button
								class={twMerge(components.button(), 'w-full')}
								onclick={() => dialogElement.close()}>Sulje</button
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