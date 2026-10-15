<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import CompassDial from '$lib/components/widgets/CompassDial.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { userLocation } from '$lib/global.svelte';
	import type { AvailabilityStore } from '$lib/types';
	import {
		getStoreCity,
		getStoreDistance,
		isStoreOpen,
		rankStoresByDistance,
		storeName,
		storeText
	} from '$lib/utils/catalog/availability';
	import { m } from '$lib/i18n';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { staticPage } from '$lib/utils/app/seo';
	import { requestUserLocation } from '$lib/utils/device/location';
	import {
		needsOrientationPermission,
		requestOrientationPermission
	} from '$lib/utils/device/orientation';
	import { components } from '$lib/utils/ui/styles';

	let { data } = $props();

	/** A closer store has to beat the current target by this much (km) before the compass switches. */
	const SWITCH_MARGIN_KM = 0.15;

	let stores = $state<AvailabilityStore[] | undefined>();
	let onlyOpen = $state(false);
	let skipped = $state<string[]>([]);
	let targetId = $state<string>();
	let permissionNeeded = $state(false);

	const candidates = $derived(
		(stores ?? []).filter(
			(store) =>
				typeof store.latitude === 'number' &&
				typeof store.longitude === 'number' &&
				!skipped.includes(store.id) &&
				(!onlyOpen || isStoreOpen(store))
		)
	);
	const origin = $derived($userLocation ? { id: '', name: '', ...$userLocation } : undefined);
	const nearest = $derived(origin ? rankStoresByDistance(candidates, origin)[0] : undefined);
	const current = $derived(candidates.find((store) => store.id === targetId));
	// Keep the current target unless another store is clearly closer, so equidistant stores don't flap.
	const target = $derived(
		current &&
			nearest &&
			(getStoreDistance(origin, current) ?? Infinity) -
				(getStoreDistance(origin, nearest) ?? Infinity) <
				SWITCH_MARGIN_KM
			? current
			: nearest
	);

	$effect(() => {
		targetId = target?.id;
	});

	onMount(() => {
		permissionNeeded = needsOrientationPermission();
		requestUserLocation();
		data.alkoWithStores.then((alko) => (stores = Object.values(alko.availability.stores)));
	});

	async function enableCompass() {
		await requestOrientationPermission();
		permissionNeeded = false;
	}

	function skipTarget(store: AvailabilityStore) {
		skipped = [...skipped, store.id];
	}

	function resetFilters(open: boolean) {
		onlyOpen = open;
		skipped = [];
	}

	const { description, keywords } = staticPage('/kompassi/');
	setSEO({
		og: { title: generateTitle(m.compass_title()), description, url: window.location.href },
		keywords,
		description
	});
</script>

<svelte:head>
	<title>{generateTitle(m.compass_title())}</title>
</svelte:head>

{#if !stores}
	<div class="grid h-full w-full place-content-center">
		<span
			class="block h-16 w-16 animate-spin rounded-full border-[0.5rem] border-red-600 border-b-transparent"
		></span>
	</div>
{:else}
	<div class="mx-auto flex w-full max-w-[60ch] flex-col items-center gap-6 p-6">
		<header class="flex flex-col gap-2 text-center">
			<h1 class="text-2xl font-bold md:text-3xl">{m.compass_title()}</h1>
			<p class="text-secondary">{m.compass_intro()}</p>
		</header>

		{#if permissionNeeded}
			<button
				type="button"
				class={twMerge(components.button({ type: 'positive', size: 'md' }), 'px-5 py-3')}
				onclick={enableCompass}
			>
				<Icon name="compass" />
				<span>{m.compass_enable()}</span>
			</button>
		{/if}

		<label class="flex items-center gap-2 text-sm">
			<input
				type="checkbox"
				class="shrink-0 rounded"
				checked={onlyOpen}
				onchange={(event) => resetFilters(event.currentTarget.checked)}
			/>
			<span>{m.compass_only_open()}</span>
		</label>

		{#if target}
			<div class="flex flex-col items-center gap-1 text-center">
				<a href={resolve(`/myymalat/${target.id}/`)} class="text-xl font-bold hover:underline">
					{storeName(target)}
				</a>
				<p class="text-sm text-secondary">
					{[storeText(target, 'address'), getStoreCity(target)].filter(Boolean).join(', ')}
				</p>
				<span
					class={isStoreOpen(target)
						? 'rounded bg-green-100 px-2 py-1 text-sm text-green-800 dark:bg-green-900 dark:text-green-100'
						: 'rounded bg-gray-100 px-2 py-1 text-sm text-gray-700 dark:bg-zinc-700 dark:text-zinc-100'}
				>
					{isStoreOpen(target) ? m.store_open() : m.store_closed_now()}
				</span>
			</div>
			{#key target.id}
				<CompassDial store={target} />
			{/key}
			<button
				type="button"
				class={components.button({ size: 'md' })}
				onclick={() => skipTarget(target)}
			>
				<Icon name="skip_next" />
				<span>{m.compass_next()}</span>
			</button>
		{:else if candidates.length === 0}
			<p class="text-secondary">{m.compass_none()}</p>
			{#if skipped.length}
				<button
					type="button"
					class={components.button({ size: 'md' })}
					onclick={() => resetFilters(onlyOpen)}
				>
					{m.compass_restart()}
				</button>
			{/if}
		{:else}
			<!-- No fix yet: the dial for any store would only show "locating", so keep the page simple. -->
			<p class="animate-pulse text-secondary">{m.compass_locating()}</p>
		{/if}
	</div>
{/if}
