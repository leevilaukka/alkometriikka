<script lang="ts">
	import '../app.css';
	import { dev } from '$app/environment';
	import { ContextKeys, GenderOptionsMap, LocalStorageKeys } from '$lib/utils/constants';
	import { isMobile, isLaptop, lists, personalInfo, searchQuery } from '$lib/global.svelte';
	import logo from '$lib/assets/images/Logo/0.5x/Logo_rounded@0.5x.png';
	import logo_transparent from '$lib/assets/images/Logo_transparent.svg';
	import Popup from '$lib/components/widgets/Popup.svelte';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { version } from '$app/environment';
	import { handleClearAll, handleExport, handleImport } from '$lib/utils/helpers';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { fade } from 'svelte/transition';
	import { SearchParamsManager } from '$lib/utils/url';
	import { setContext } from 'svelte';

	let { children, data } = $props();

	let searchParamsManager = new SearchParamsManager(page.url)
	setContext(ContextKeys.SearchParamsManager, searchParamsManager)

	$effect(() => {
		localStorage.setItem(LocalStorageKeys.PersonalInfo, JSON.stringify(personalInfo));
	});

	$effect(() => {
		localStorage.setItem(LocalStorageKeys.Lists, JSON.stringify(lists));
	});

	let tab = $state<'personal' | 'info' | 'settings'>('personal');

	window.addEventListener('resize', () => {
		$isMobile = window.matchMedia('(width < 48rem)').matches;
		$isLaptop = window.matchMedia('(width < 1280px)').matches;
		graphicSize = Math.min(Math.min(window.innerWidth / 3, 640), window.innerHeight / 3)
	});

	beforeNavigate(({ to }) => {
		if(!to) return
		searchParamsManager.setParametersFromURL(to?.url as URL)
		searchParamsManager.update()
	});

	let graphicSize = $state(Math.min(Math.min(window.innerWidth / 3, 640), window.innerHeight / 3));
	let barCount = $derived.by(() => {
		let out = Math.ceil(document.body.clientWidth / (graphicSize / 3));
		if (!(out % 2 == 0)) out -= 1;
		return out
	});
	let bars = $derived(Array.apply(null, Array(barCount / 2)).map(() => {}));
	let barMaxHeight = $derived(graphicSize / 2)

	function oscillate(node: HTMLDivElement) {
		let dir = node.clientHeight < barMaxHeight/2 ? 1 : -1;
		setInterval(() => {
			node.style.height = `${node.clientHeight + dir*(0.5 + Math.random() * graphicSize/200)}px`
			if(node.clientHeight <= barMaxHeight/10) {
				dir = 1;
			} else if(node.clientHeight >= barMaxHeight) {
				dir = -1;
			}
		}, 5)
	}

	function weightedRandom(index: number, min: number, max: number) {
		const r = Math.random();
		const exponent = index % 2 === 0 ? 0.5 : 2.0;
		const weighted = Math.pow(r, exponent);
		return min + weighted * (max - min);
	}
</script>




{#await data.alko}
	<div 
	out:fade={{ delay: 500 }}
	class="fixed inset-0 z-99999 block h-full w-full items-end bg-white">
		<div
			style={`transform: translate(calc(calc(100% + min(${graphicSize/6}px, 107px)) * -1), 0%)`}
			class="absolute bottom-0 left-1/2 flex flex-row-reverse flex-nowrap items-end"
		>
			{#each bars as _, index}
				<div
					use:oscillate
					style={`min-width: ${graphicSize / 3}px; height: ${weightedRandom(index, barMaxHeight / 10, barMaxHeight)}px`}
					class={twMerge('block', ['bg-brand-1', 'bg-brand-2', 'bg-brand-3'][(index * 2) % 3])}
				></div>
			{/each}
		</div>
		<img
			src={logo_transparent}
			alt="Alkometriikka Logo"
			style={`clip-path: inset(0 33.333% 0 33.333%); height: ${graphicSize}px; `}
			class="absolute -bottom-1 left-1/2 aspect-square -translate-x-1/2 rounded object-contain"
		/>
		<div 
		style={`transform: translate(min(${graphicSize/6}px, 107px), 0%)`}
		class="absolute bottom-0 left-1/2 flex flex-row flex-nowrap items-end">
			{#each bars as _, index}
				<div
					use:oscillate
					style={`min-width: ${graphicSize / 3}px; height: ${weightedRandom(index, barMaxHeight / 10, barMaxHeight)}px`}
					class={twMerge('block', ['bg-brand-3','bg-brand-1', 'bg-brand-2'][(index * 2) % 3])}
				></div>
			{/each}
		</div>
		<div class="absolute left-1/2 top-1/3 -translate-1/2 text-center flex flex-col gap-3">
			<h1 class="text-4xl text-brand-3">Alkometriikka</h1>
			<p>Ladataan...</p>
		</div>
	</div>
{:then alko}
	<div class="flex h-full w-full flex-col">
		{#if dev}
			<span class="bg-brand-3 px-1.5 py-0.5 text-center text-sm text-white">DEV</span>
		{/if}
		<header class="relative flex h-fit items-center gap-2 border-b border-gray-300 p-2 md:gap-4">
			<a href="/" class="flex shrink-0 flex-row items-center gap-3 bg-white">
				<img
					src={logo}
					alt="Alkometriikka Logo"
					class="aspect-square h-10 rounded object-contain"
				/>
				<span class="hidden text-[1.75rem] text-brand-3 sm:block">Alkometriikka</span>
			</a>
			{#if page.route.id !== '/tuotteet/[...id]'}
				<div
					class={twMerge(
						'flex w-full flex-row',
						'rounded border border-gray-300'
					)}
				>
					<div
						class={twMerge(
							components.button(),
							'aspect-square border-0 bg-white text-black',
							'p-2 text-xl',
							'rounded-e-none border-e-0'
						)}
					>
						<Icon name="search" />
					</div>
					<input
						id="searchQuery"
						type="text"
						bind:value={$searchQuery}
						class={twMerge(
							components.input(),
							'text-md w-full gap-2 rounded-s-none border-0 border-s hover:border-gray-300'
						)}
						placeholder="Hae nimellä..."
					/>
				</div>
			{/if}
			<a href="/listat" class={twMerge(page.route.id !== '/tuotteet/[...id]' ? '' : 'ms-auto')}>
				<button class={twMerge(components.button(), 'p-2 text-xl')}>
					{#if !$isMobile}<span class="text-sm">Listat</span>{/if}<Icon name="list_ul" />
				</button>
			</a>
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
							personalInfo.weight !== null &&
							personalInfo.weight >= 1 &&
							personalInfo.weight <= 500}
						<div class="prose">
							<h2 class="text-lg font-bold">Henkilökohtaiset tiedot</h2>
							<p class="text-sm text-gray-600">
								Nämä tiedot vaikuttavat promillearvioihin. Annetut tiedot tallennetaan vain
								paikallisesti, eikä niitä lähetetä mihinkään.
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
								<p class="text-xs text-red-600">Painon tulee olla välillä 1-500 kg.</p>
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
		</header>
		<div class="flex max-h-full overflow-y-auto overflow-x-hidden flex-auto flex-col">
			{@render children?.()}
		</div>
	</div>
{:catch error}
	<div class="grid h-full w-full max-h-full overflow-hidden place-content-center">
		<div class="flex flex-col items-center gap-3">
			<p>Virhe datan lataamisessa: {error.message}</p>
			<button class="rounded bg-brand-1 px-4 py-2 text-white" onclick={() => location.reload()}>
				Yritä uudelleen
			</button>
		</div>
	</div>
{/await}
