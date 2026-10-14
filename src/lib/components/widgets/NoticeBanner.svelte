<script lang="ts" module>
	const LANDING_PARAMS_KEY = 'notice_landing_params';

	/**
	 * The query params the visitor arrived with, read once per page load so campaign notices
	 * stay up after client-side navigation drops them from the URL. Kept for the session so a
	 * reload on another page doesn't lose them either.
	 */
	function readLandingParams(): URLSearchParams {
		const params = new URLSearchParams(location.search);
		try {
			const stored = new URLSearchParams(sessionStorage.getItem(LANDING_PARAMS_KEY) ?? '');
			for (const [key, value] of params) stored.set(key, value);
			sessionStorage.setItem(LANDING_PARAMS_KEY, stored.toString());
			return stored;
		} catch {
			// Storage blocked; the current URL is all there is
			return params;
		}
	}

	const landingParams = readLandingParams();
</script>

<script lang="ts">
	import { appPath } from '$lib/utils/paths';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { twMerge } from 'tailwind-merge';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { components } from '$lib/utils/styles';
	import { LocalStorageKeys, timeConfig } from '$lib/utils/constants';
	import { LocalStorageManager } from '$lib/utils/storage';
	import {
		CACHED_NOTICE_ID,
		STALE_NOTICE_ID,
		parseNotices,
		visibleNotices,
		type Notice
	} from '$lib/utils/notices';

	const { lastSynced, cached = false }: { lastSynced?: string; cached?: boolean } = $props();

	let notices = $state<Notice[]>([]);
	let dismissed = $state(new Set(LocalStorageManager.getItem(LocalStorageKeys.DismissedNotices)));
	let online = $state(navigator.onLine);

	const lastSyncedLabel = $derived.by(() => {
		if (!lastSynced) return '';
		const date = new Date(lastSynced);
		return `${date.toLocaleDateString('fi-FI')} klo ${date.toLocaleTimeString('fi-FI', timeConfig)}`;
	});

	const cachedMessage = $derived.by(() => {
		const updated = lastSyncedLabel ? ` (päivitetty ${lastSyncedLabel})` : '';
		if (!online) return `Ei verkkoyhteyttä. Näytetään tallennetut tiedot${updated}.`;
		if (cached)
			return `Uusimpia tietoja ei saatu ladattua, joten näytetään tallennetut tiedot${updated}.`;
		return undefined;
	});

	const visible = $derived(
		visibleNotices(notices, {
			lastSynced,
			dismissed,
			now: Date.now(),
			params: landingParams,
			staleMessage: `Alkon tietoja ei ole saatu päivitettyä ${lastSyncedLabel} jälkeen. Hinnat ja saatavuus voivat olla vanhentuneita.`,
			cachedMessage
		})
	);

	// Loaded on its own after the app has rendered; a missing or broken file just means no notices
	onMount(() => {
		fetch(resolve('/') + 'notices.json', { cache: 'no-cache' })
			.then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
			.then((raw) => {
				notices = parseNotices(raw);
				// Forget dismissals of notices that have been removed so the list doesn't grow forever
				const known = new Set(notices.map((notice) => notice.id));
				const kept = [...dismissed].filter(
					(id) =>
						known.has(id) ||
						id === `${STALE_NOTICE_ID}:${lastSynced}` ||
						id === `${CACHED_NOTICE_ID}:${lastSynced}`
				);
				if (kept.length !== dismissed.size) {
					dismissed = new Set(kept);
					LocalStorageManager.setItem(LocalStorageKeys.DismissedNotices, kept);
				}
			})
			.catch((error) => console.warn('Ilmoitusten lataaminen epäonnistui:', error));
	});

	function dismiss(id: string) {
		dismissed = new Set([...dismissed, id]);
		LocalStorageManager.setItem(LocalStorageKeys.DismissedNotices, [...dismissed]);
	}
</script>

<svelte:window ononline={() => (online = true)} onoffline={() => (online = false)} />

{#each visible as notice (notice.id)}
	<div
		role={notice.level === 'warning' ? 'alert' : 'status'}
		class={twMerge(
			'flex items-start gap-2 border-b px-4 py-2 text-sm',
			notice.level === 'warning'
				? 'border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100'
				: 'border-primary bg-secondary'
		)}
	>
		<Icon
			name={notice.level === 'warning' ? 'alert_triangle' : 'info_circle'}
			class="mt-0.5 shrink-0"
		/>
		<p class="flex-1">
			{notice.message}
			{#if notice.link}
				<a
					href={notice.link.href.startsWith('/') ? appPath(notice.link.href) : notice.link.href}
					target={notice.link.href.startsWith('/') ? undefined : '_blank'}
					class="font-semibold underline">{notice.link.label}</a
				>
			{/if}
		</p>
		{#if notice.dismissible}
			<button
				aria-label="Sulje ilmoitus"
				class={twMerge(components.button({ type: 'noborder' }), 'p-1 text-current')}
				onclick={() => dismiss(notice.id)}
			>
				<Icon name="x" />
			</button>
		{/if}
	</div>
{/each}
