<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import type { ArchiveIndex } from '$lib/daily/manifest';
	import type { ArchivedScores, ArchiveRuns } from '$lib/daily/types';
	import { loadArchivedScores, loadArchiveRuns } from '$lib/daily/storage';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { dayNumberForDate } from '$lib/daily/dayNumber';
	import { intlLocale, m } from '$lib/i18n';

	// Monday first; 2024-01-01 was a Monday
	const weekdayFormatter = new Intl.DateTimeFormat(intlLocale, { weekday: 'short' });
	const weekdayLabels = Array.from({ length: 7 }, (_, day) =>
		weekdayFormatter.format(new Date(2024, 0, 1 + day, 12))
	);
	const monthFormatter = new Intl.DateTimeFormat(intlLocale, {
		month: 'long',
		year: 'numeric',
		timeZone: 'Europe/Helsinki'
	});
	const today = new Date();
	const todayISO = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Helsinki',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(today);

	let index = $state<ArchiveIndex | null>(null);
	let loadError = $state<string | null>(null);
	let scores: ArchivedScores = $state(loadArchivedScores());
	let runs: ArchiveRuns = $state(loadArchiveRuns());
	let viewYear = $state(today.getFullYear());
	let viewMonth = $state(today.getMonth());

	const available = $derived(new Set(index?.dates ?? []));
	const monthLabel = $derived(monthFormatter.format(new Date(viewYear, viewMonth, 15, 12)));
	const leading = $derived((new Date(viewYear, viewMonth, 1, 12).getDay() + 6) % 7);
	const daysInMonth = $derived(new Date(viewYear, viewMonth + 1, 0, 12).getDate());
	const cells = $derived([
		...Array.from({ length: leading }, () => null as number | null),
		...Array.from({ length: daysInMonth }, (_, dayIndex) => dayIndex + 1)
	]);
	const maxMonthStart = $derived(new Date(today.getFullYear(), today.getMonth(), 1, 12));
	// Compare month starts on both sides: using the oldest *date* here made its
	// own month unreachable whenever that date was not the 1st.
	const minMonthStart = $derived.by(() => {
		const oldest = index?.dates[index.dates.length - 1];
		if (!oldest) return maxMonthStart.getTime();
		const [year, month] = oldest.split('-').map(Number);
		return new Date(year!, month! - 1, 1, 12).getTime();
	});
	const canGoBack = $derived(new Date(viewYear, viewMonth, 1, 12).getTime() > minMonthStart);
	const canGoForward = $derived(
		new Date(viewYear, viewMonth, 1, 12).getTime() < maxMonthStart.getTime()
	);

	$effect(() => {
		if (index || loadError) return;
		void loadIndex();
	});

	async function loadIndex() {
		loadError = null;
		try {
			const response = await fetch(asset(`/daily/archive/index.json`));
			if (response.status === 404) {
				index = { version: 1, dates: [] };
				return;
			}
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const parsed = (await response.json()) as ArchiveIndex;
			if (!parsed || !Array.isArray(parsed.dates)) throw new Error(m.archive_invalid_index());
			const newest = parsed.dates[0];
			if (newest) {
				const [year, month] = newest.split('-').map(Number);
				if (Number.isFinite(year) && Number.isFinite(month)) {
					viewYear = year;
					viewMonth = month - 1;
				}
			}
			index = parsed;
		} catch (error) {
			loadError = error instanceof Error ? error.message : m.archive_unknown_error();
		}
	}

	function monthOffset(delta: number) {
		const target = new Date(viewYear, viewMonth + delta, 1, 12);
		if (target > maxMonthStart) return;
		if (target.getTime() < minMonthStart) return;
		viewYear = target.getFullYear();
		viewMonth = target.getMonth();
	}

	function toISO(year: number, month: number, day: number) {
		return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	}

	$effect(() =>
		setSEO({
			description: m.archive_seo_description(),
			keywords: m.seo_archive_keywords(),
			og: {
				description: m.archive_seo_og_description(),
				title: m.daily_archive(),
				url: window.location.href,
				type: 'website'
			},
			twitter: { description: m.archive_seo_title(), title: m.daily_archive() }
		})
	);
</script>

<svelte:head>
	<title>{generateTitle(m.daily_archive())}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8 lg:gap-8 lg:p-10">
	<header class="flex flex-col gap-2 border-b border-primary pb-5">
		<div class="flex items-center justify-between gap-4">
			<div>
				<p class="text-sm font-bold tracking-widest text-brand-2 uppercase">Alkometriikka Daily</p>
				<div class="flex items-center gap-2">
					<h1 class="text-3xl font-bold md:text-4xl">{m.daily_archive()}</h1>
					<Icon name="calendar" />
				</div>
			</div>
			<a href={resolve('/daily/')} class={twMerge(components.button(), 'px-3 py-2')}
				><span class="flex items-center gap-2"><Icon name="flame" />{m.archive_todays_game()}</span
				></a
			>
		</div>
		{#if index}
			<p class="text-sm text-secondary">
				{m.archive_summary({ count: index.dates.length })}
			</p>
		{/if}
	</header>

	{#if loadError}
		<section class="rounded border border-primary bg-secondary p-5 text-center">
			<p>{m.archive_load_error({ message: loadError })}</p>
			<button class={twMerge(components.button(), 'mt-3 px-3 py-2')} onclick={loadIndex}
				>{m.common_retry()}</button
			>
		</section>
	{:else if !index}
		<section class="rounded border border-primary bg-secondary p-5 text-center">
			<p>{m.archive_loading()}</p>
		</section>
	{:else}
		<section class="flex flex-col gap-4">
			<div class="flex items-center justify-between">
				<button
					class={twMerge(
						components.button(),
						'px-3 py-2 disabled:opacity-40 disabled:hover:bg-white disabled:dark:hover:bg-zinc-800'
					)}
					onclick={() => monthOffset(-1)}
					disabled={!canGoBack}
					aria-label={m.archive_previous_month()}
				>
					<Icon name="chevron_left" />
				</button>
				<h2 class="text-xl font-bold">{monthLabel}</h2>
				<button
					class={twMerge(
						components.button(),
						'px-3 py-2 disabled:opacity-40 disabled:hover:bg-white disabled:dark:hover:bg-zinc-800'
					)}
					onclick={() => monthOffset(1)}
					disabled={!canGoForward}
					aria-label={m.archive_next_month()}
				>
					<Icon name="chevron_right" />
				</button>
			</div>

			<div class="grid grid-cols-7 gap-1 text-center">
				{#each weekdayLabels as label (label)}
					<div class="py-1 text-xs font-bold text-secondary uppercase">{label}</div>
				{/each}
				{#each cells as day, dayIndex (dayIndex)}
					{@const iso = day === null ? null : toISO(viewYear, viewMonth, day)}
					{@const result = iso ? scores[iso] : undefined}
					{@const inProgress = iso ? (runs[iso] && !runs[iso].completed ? true : false) : false}
					{@const dayNumber = iso ? dayNumberForDate(iso) : 0}
					{#if iso && available.has(iso)}
						<a
							href={resolve(`/daily/arkisto/${iso}/`)}
							class="relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded border border-primary bg-primary p-1.5 transition-colors hover:border-brand-2"
						>
							{#if dayNumber >= 1}
								<span class="absolute top-1 right-1 text-[9px] font-bold text-secondary"
									>#{dayNumber}</span
								>
							{/if}
							<span class="text-sm font-bold">{day}</span>
							{#if result}
								<span class="rounded bg-brand-4 px-1.5 py-0.5 text-[10px] font-bold text-white">
									{m.archive_points_short({ score: result.score })}
								</span>
							{:else if inProgress}
								<span class="text-[10px] font-bold text-brand-2">{m.archive_in_progress()}</span>
							{:else}
								<span class="text-[10px] text-secondary">{m.archive_play()}</span>
							{/if}
						</a>
					{:else if iso === todayISO}
						<a
							href={resolve('/daily/')}
							class="relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded border border-dashed border-brand-2 bg-secondary p-1.5 transition-colors hover:bg-primary"
						>
							{#if dayNumber >= 1}
								<span class="absolute top-1 right-1 text-[9px] font-bold text-brand-2"
									>#{dayNumber}</span
								>
							{/if}
							<span class="text-sm font-bold text-brand-2">{day}</span>
							<span class="text-[10px] font-bold text-brand-2">{m.archive_today()}</span>
						</a>
					{:else if iso && iso < todayISO && result}
						<span
							class="relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded border border-dashed border-primary bg-primary p-1.5 opacity-80"
							title={m.archive_archiving_soon()}
						>
							{#if dayNumber >= 1}
								<span class="absolute top-1 right-1 text-[9px] font-bold text-secondary"
									>#{dayNumber}</span
								>
							{/if}
							<span class="text-sm font-bold">{day}</span>
							<span class="rounded bg-brand-4 px-1.5 py-0.5 text-[10px] font-bold text-white">
								{m.archive_points_short({ score: result.score })}
							</span>
						</span>
					{:else if iso && iso < todayISO && dayNumber >= 1}
						<span
							class="relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded border border-dashed border-primary p-1.5 opacity-60"
							title={m.archive_not_archived_yet()}
						>
							<span class="absolute top-1 right-1 text-[9px] font-bold text-secondary"
								>#{dayNumber}</span
							>
							<span class="text-sm font-bold">{day}</span>
							<span class="text-[10px] text-secondary">{m.archive_waiting()}</span>
						</span>
					{:else}
						<span
							class="flex min-h-14 items-center justify-center rounded p-1.5 text-sm text-secondary"
						>
							{day ?? ''}
						</span>
					{/if}
				{/each}
			</div>
		</section>
	{/if}
</div>
