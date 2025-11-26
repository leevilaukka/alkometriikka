<script lang="ts">
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';
	import { isLaptop, isMobile, personalInfo, theme } from '$lib/global.svelte';
	import { GenderOptionsMap } from '$lib/utils/constants';
	import Popup from '$lib/components/widgets/Popup.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { version } from '$app/environment';
	import { generateOutLink, handleClearAll, handleExport, handleImport } from '$lib/utils/helpers';

	let tab = $state<'personal' | 'info' | 'settings'>('personal');

	const { alko }: { alko: any } = $props();
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
					<a href={generateOutLink("https://github.com/leevilaukka/alkometriikka", true)} target="_blank">
						avoimen lähdekoodin
					</a> web-sovellus, joka listaa Alkon tuotevalikoiman ja antaa käyttäjille hieman laskennallista
					tietoa tuotteista.
				</p>
				<p>
					Hinnasto ladataan Alkon julkisesta Excel-tiedostosta. Tiedostoa päivitetään noin
					vuorokauden viiveellä. Voit ladata sen <a
						href={generateOutLink("https://www.alko.fi/INTERSHOP/static/WFS/Alko-OnlineShop-Site/-/Alko-OnlineShop/fi_FI/Alkon%20Hinnasto%20Tekstitiedostona/alkon-hinnasto-tekstitiedostona.xlsx")}
						target="_blank"
						>täältä
					</a>.
				</p>
				<p>
					Voit lähettää kehitysehdotuksia ja bugiraportteja GitHubin kautta. <br />
					<a
						href={generateOutLink("https://github.com/leevilaukka/alkometriikka/issues/new?template=feature_request.md", true)}
						>Lähetä kehitysehdotus
					</a>
					|
					<a href={generateOutLink("https://github.com/leevilaukka/alkometriikka/issues/new?template=bug_report.md", true)}
						>Lähetä bugiraportti
					</a>
				</p>
				<p>
					Muut yhteydenotot voi lähettää sähköpostitse osoitteeseen
					<a href="mailto:contact@alkometriikka.fi">contact@alkometriikka.fi</a>.
				</p>
			</div>
			<div class="flex flex-row items-center gap-2">
				<a
					href={generateOutLink("https://github.com/leevilaukka/alkometriikka", true)}
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
				Versio: <a href={generateOutLink(`https://github.com/leevilaukka/alkometriikka/commit/${version}`, true)} target="_blank">
					{version}
				</a>
				{#if alko.dataset.metadata.CreatedDate}
					| Hinnaston päiväys: {new Date(alko.dataset.metadata.CreatedDate).toLocaleDateString(
						'fi-FI'
					)}
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
					ja mukautetut listat. Tiedot tallennetaan JSON-muodossa.
				</p>
				<div class="flex flex-row gap-2">
					<button
						class={twMerge(components.button())}
						onclick={() => {
							handleExport();
						}}
					>
						<Icon name="download" /> <span>Vie tiedot</span></button
					>

					<button
						class={twMerge(components.button())}
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
