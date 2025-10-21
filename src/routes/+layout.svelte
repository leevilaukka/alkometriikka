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
	import Barcode from '$lib/components/widgets/Barcode.svelte';
	import Settings from '$lib/components/widgets/Settings.svelte';

	let { children, data } = $props();

	let searchParamsManager = new SearchParamsManager(page.url)
	setContext(ContextKeys.SearchParamsManager, searchParamsManager)

	$effect(() => {
		localStorage.setItem(LocalStorageKeys.PersonalInfo, JSON.stringify(personalInfo));
	});

	$effect(() => {
		localStorage.setItem(LocalStorageKeys.Lists, JSON.stringify(lists));
	});


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
		<header class="relative flex h-fit items-center gap-2 md:gap-4 border-b border-gray-300 py-2 px-4">
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
			<div class="flex items-center gap-2 ms-auto">
				{#if $isMobile}
					<Barcode kaljakori={alko.kaljakori} />
				{/if}	
				<a href="/listat">
					<button class={twMerge(components.button(), 'p-2 text-xl')}>
						{#if !$isMobile}<span class="text-sm">Listat</span>{/if}<Icon name="list_ul" />
					</button>
				</a>
				<Settings {alko} />
			</div>
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
