<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/images/favicon.png';
	import { dev } from '$app/environment';
	import { GenderOptionsMap, LocalStorageKeys } from '$lib/utils/constants';
	import { personalInfo } from '$lib/global.svelte';
	import logo from '$lib/assets/images/logo.png';
	import Popup from '$lib/components/widgets/Popup.svelte';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import Icon from '$lib/components/widgets/Icon.svelte';

	let { children, data } = $props();

	$effect(() => { localStorage.setItem(LocalStorageKeys.PersonalInfo, JSON.stringify(personalInfo))})
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Alkometriikka {dev ? '- DEV' : ''}</title>
</svelte:head>

{#await data.dataset}
	<div class="grid w-full h-full place-content-center">
		<div class="flex flex-col gap-3 items-center">
			<span class="block w-16 h-16 border-[0.5rem] border-red-600 border-b-transparent animate-spin rounded-full"></span>
			<p>Ladataan...</p>
		</div>
	</div>
{:then}
	<div class="flex flex-col w-full h-full">
		<header class="flex h-fit items-center justify-between border-b border-gray-300 p-2">
			<div class="flex flex-col items-center bg-white">
				<img src={logo} alt="Alkoassistentti Logo" class="aspect-[10/2] h-12 object-contain" />
			</div>
			<Popup>
				{#snippet renderButton(dialogElement: HTMLDialogElement)}
					<button 
						class={twMerge(components.button(), "p-2 text-xl")}
						onclick={() => dialogElement.showModal()}
					>
						<Icon name="settings" />
					</button>
				{/snippet}
				{#snippet renderContent(dialogElement: HTMLDialogElement)}
				<div class="prose">
					<h2 class="text-lg font-bold">Henkilökohtaiset tiedot</h2>
					<p class="text-sm text-gray-600">Nämä tiedot vaikuttavat promillearvioihin. Annetut tiedot tallennetaan vain paikallisesti, eikä niitä lähetetä mihinkään.</p>
				</div>
				<div class="flex flex-col">
					<label for="weight" class="text-sm">Paino (kg)</label>
					<input type="number" name="weight" bind:value={personalInfo.weight} placeholder="Paino (kg)" class={twMerge(components.input(), "w-full")} min="1" max="500" step="0.1" />
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
					<button class={twMerge(components.button({type: "positive"}), "w-full")} onclick={() => window.location.reload()}>Tallenna</button>
				</div>
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
