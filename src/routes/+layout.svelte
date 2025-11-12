<script lang="ts">
	import '../app.css';
	import { dev } from '$app/environment';
	import { ContextKeys, LocalStorageKeys } from '$lib/utils/constants';
	import { isMobile, isLaptop, lists, personalInfo, searchQuery, theme } from '$lib/global.svelte';
	import logo from '$lib/assets/images/Logo/0.5x/Logo_rounded@0.5x.png';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
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

	$effect(() => {
		localStorage.setItem(LocalStorageKeys.Theme, $theme);
	});

	theme.subscribe((value) => {
		const mql = window.matchMedia("(prefers-color-scheme: dark)")
		const handleDarkModeChange = (event: MediaQueryListEvent) => {
			if(event.matches) document.documentElement.classList.add("dark")
			else document.documentElement.classList.remove("dark")
		}
		mql.removeEventListener("change", handleDarkModeChange)
		if(value === "dark") document.documentElement.classList.add("dark")
		else if(value === "light") document.documentElement.classList.remove("dark")
		else {
			if(mql.matches) document.documentElement.classList.add("dark")
			else document.documentElement.classList.remove("dark")
			mql.addEventListener("change", handleDarkModeChange)
		}
	})

	window.addEventListener('resize', () => {
		$isMobile = window.matchMedia('(width < 48rem)').matches;
		$isLaptop = window.matchMedia('(width < 1280px)').matches;
	});

	beforeNavigate(({ to }) => {
		if(!to) return
		if(to.url.origin !== window.location.origin) return
		searchParamsManager.setParametersFromURL(to.url)
		searchParamsManager.update()
	});

	function shiftLoader() {
		document.getElementById("main-loader")?.classList.add("shift");
	}
</script>

{#await data.alko then alko}
	{shiftLoader()}
	<div class="flex h-full w-full flex-col">
		{#if dev}
			<span class="bg-brand-3 px-1.5 py-0.5 text-center text-sm text-white">DEV</span>
		{/if}
		<header class="relative flex h-fit items-center gap-2 md:gap-4 bg-primary border-b border-primary py-2 px-4">
			<a href="/" class="flex shrink-0 flex-row items-center gap-3 bg-primary">
				<img
					src={logo}
					alt="Alkometriikka Logo"
					class="aspect-square h-10 rounded object-contain"
				/>
				<span class="hidden text-[1.75rem] text-brand-3 dark:text-white sm:block">Alkometriikka</span>
			</a>
			{#if page.route.id !== '/tuotteet/[...id]'}
				<div
					class={twMerge(
						'flex w-full flex-row',
						'rounded border border-primary'
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
							'text-md w-full gap-2 rounded-s-none border-0 border-s hover:border-primary'
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
