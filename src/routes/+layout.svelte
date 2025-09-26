<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/images/favicon.png';
	import { dev } from '$app/environment';
	import { GenderOptionsMap, LocalStorageKeys } from '$lib/utils/constants';
	import { isMobile, lists, personalInfo } from '$lib/global.svelte';
	import logo from '$lib/assets/images/logo.png';
	import Popup from '$lib/components/widgets/Popup.svelte';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { version } from '$app/environment';

	let { children, data } = $props();

	$effect(() => { localStorage.setItem(LocalStorageKeys.PersonalInfo, JSON.stringify(personalInfo))})
	$effect(() => { localStorage.setItem(LocalStorageKeys.Lists, JSON.stringify(lists))})

	let tab = $state<'personal' | 'info'>('personal');
	

	window.addEventListener('resize', () => {
		$isMobile = window.matchMedia('(width <= 48rem)').matches;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Alkometriikka {dev ? '- DEV' : ''}</title>
</svelte:head>

{#await data}
	<div class="grid w-full h-full place-content-center">
		<div class="flex flex-col gap-3 items-center">
			<span class="block w-16 h-16 border-[0.5rem] border-red-600 border-b-transparent animate-spin rounded-full"></span>
			<p>Ladataan...</p>
		</div>
	</div>
{:then}
	<div class="flex flex-col w-full h-full">
		<header class="flex h-fit items-center p-2 border-b border-gray-300">
			<div class="flex flex-row gap-3 items-center bg-white">
				<a href="/"><img src={logo} alt="Alkoassistentti Logo" class="aspect-[10/2] h-12 object-contain" /></a>
			</div>
			{#if dev}
				<span class="ms-2 rounded bg-red-200 px-1.5 py-0.5 text-sm text-red-800">DEV</span>
			{/if}
			<a href="/listat" class="ms-auto me-2">
				<button class={twMerge(components.button(), "p-2 text-xl")}>
					{#if !$isMobile}<span class="text-sm">Listat</span>{/if}<Icon name="list" />
				</button>
			</a>
			<Popup class="p-4 gap-4">
				{#snippet renderButton(dialogElement: HTMLDialogElement)}
					<button 
						class={twMerge(components.button(), "p-2 text-xl")}
						onclick={() => dialogElement.showModal()}
					>
						{#if !$isMobile}<span class="text-sm">Asetukset</span>{/if}<Icon name="settings" />
					</button>
				{/snippet}
				{#snippet renderContent(dialogElement: HTMLDialogElement)}
				<!-- Tab selector -->
				<div class="flex flex-row gap-2 border-b border-gray-300 pb-2 mb-2">
					<button class={twMerge(components.button(), "w-full", tab === 'personal' ? 'bg-gray-200' : '')} onclick={() => tab = 'personal'}><Icon name="user" />{#if !$isMobile}<span class="ms-2">Henkilökohtaiset tiedot</span>{/if}</button>
					<button class={twMerge(components.button(), "w-full", tab === 'info' ? 'bg-gray-200' : '')} onclick={() => tab = 'info'}><Icon name="info" />{#if !$isMobile}<span class="ms-2">Tietoa</span>{/if}</button>

				</div>
				{#if tab === 'info'}
					<div class="prose">
						<h2 class="text-lg font-bold">Tietoa</h2>
						<p>Alkometriikka on <a href="https://github.com/leevilaukka/alkometriikka" target="_blank">avoimen lähdekoodin</a> web-sovellus, joka listaa Alkon tuotevalikoiman ja antaa käyttäjille hieman laskennallista tietoa tuotteista.</p>
						<p>Hinnasto ladataan Alkon julkisesta Excel-tiedostosta. Tiedostoa päivitetään noin vuorokauden viiveellä. Voit <a href="https://www.alko.fi/INTERSHOP/static/WFS/Alko-OnlineShop-Site/-/Alko-OnlineShop/fi_FI/Alkon%20Hinnasto%20Tekstitiedostona/alkon-hinnasto-tekstitiedostona.xlsx" target="_blank" rel="noopener noreferrer">ladata sen täältä</a>.</p>
					</div>
					{console.log(data.dataset.metadata)}
					<p class="text-sm text-gray-600">Versio: <a href="https://github.com/leevilaukka/alkometriikka/commit/{version}">{version}</a> {#if data.dataset.metadata?.CreatedDate} | Hinnaston päiväys: {new Date(data.dataset.metadata?.CreatedDate).toLocaleDateString("fi-FI")}{/if}</p>
					<button class={twMerge(components.button(), "w-full")} onclick={() => dialogElement.close()}>Sulje</button>
				{/if}
				{#if tab === 'personal'}
				{@const weightOK = personalInfo.weight !== null && personalInfo.weight >= 1 && personalInfo.weight <= 500}
				<div class="prose">
					<h2 class="text-lg font-bold">Henkilökohtaiset tiedot</h2>
					<p class="text-sm text-gray-600">Nämä tiedot vaikuttavat promillearvioihin. Annetut tiedot tallennetaan vain paikallisesti, eikä niitä lähetetä mihinkään.</p>
				</div>
				<div class="flex flex-col">
					<label for="weight" class="text-sm">Paino (kg)</label>
					<input type="number" name="weight" bind:value={personalInfo.weight} placeholder="Paino (kg)" class={twMerge(components.input(), "w-full")} min="1" max="500" step="0.1" />
					{#if !weightOK}
						<p class="text-xs text-red-600">Painon tulee olla välillä 1-500 kg.</p>
					{/if}
				</div>
				<div class="flex flex-col">
					<label for="gender" class="text-sm">Sukupuoli</label>
					<select name="gender" bind:value={personalInfo.gender} class={twMerge(components.input(), "w-full")}>
						<option value={null}>Valitse sukupuoli</option>
						{#each Object.values(GenderOptionsMap) as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</div>
				<p class="text-xs text-gray-600 self-end">Tallentaminen lataa sivun uudelleen.</p>
				<div class="grid grid-cols-2 gap-3">
					<button class={twMerge(components.button(), "w-full")} onclick={() => dialogElement.close()}>Sulje</button>
					<button class={twMerge(components.button({type: "positive"}), "w-full", !weightOK ? 'opacity-50 cursor-not-allowed' : '')} disabled={!weightOK} onclick={() => window.location.reload()}>Tallenna</button>
				</div>
				{/if}
				{/snippet}
			</Popup>
		</header>
		<div class="flex flex-col flex-auto max-h-full">
			{@render children?.()}
		</div>
	</div>
{:catch error}
	<div class="grid w-full h-full place-content-center">
		<div class="flex flex-col gap-3 items-center">
			<p>Virhe datan lataamisessa: {error.message}</p>
			<button class="bg-red-600 text-white py-2 px-4 rounded" onclick={() => location.reload()}>Yritä uudelleen</button>
		</div>
	</div>
{/await}
