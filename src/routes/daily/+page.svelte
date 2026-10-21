<script lang="ts">
	import { productName as localizedName } from '$lib/i18n/values';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { LocalStorageKeys } from '$lib/utils/constants/app';
	import { components } from '$lib/utils/ui/styles';
	import type { PriceListItem } from '$lib/types';
	import { createRng } from '$lib/daily/rng';
	import {
		reconstructDailyGame,
		type DailyGameManifest,
		type DailyProduct
	} from '$lib/daily/manifest';
	import { dayNumberForDate } from '$lib/daily/dayNumber';
	import {
		DAILY_GAME_VERSION,
		DAILY_QUESTION_COUNT,
		generateDailyGame,
		type GeneratedGame,
		type Question
	} from '$lib/daily/questions';
	import type { DailyStreak, SavedDailyGame, UnlimitedRunState } from '$lib/daily/types';
	import { questionPoints } from '$lib/daily/scoring';
	import {
		clearUnlimitedProgress,
		completeGame,
		loadSavedGame,
		loadStreak,
		loadUnlimitedProgress,
		resetDailyGame,
		saveGame,
		saveUnlimitedProgress
	} from '$lib/daily/storage';
	import { LocalStorageManager } from '$lib/utils/app/storage';
	import { tick } from 'svelte';
	import { dev } from '$app/environment';
	import { base, resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { handleShare } from '$lib/utils/app/share';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import ProductImage from '$lib/components/widgets/ProductImage.svelte';
	import { twMerge } from 'tailwind-merge';
	import type { PageProps } from './$types';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import DailyFeedback from '$lib/components/widgets/DailyFeedback.svelte';
	import {
		attributeTitle,
		attributeValueLabel,
		choiceLabel,
		choiceTitle,
		estimateDetails,
		formatEfficiency as efficiency,
		formatPrice as price
	} from '$lib/daily/labels';
	import { intlLocale, locale, m } from '$lib/i18n';

	let { data }: PageProps = $props();
	let products = $state<PriceListItem[]>([]);
	/** The day's frozen manifest pool; preferred over the live catalog for display. */
	let pool = $state<PriceListItem[]>([]);
	let game = $state<GeneratedGame | null>(null);
	let saved = $state<SavedDailyGame | null>(null);
	let streak = $state<DailyStreak>(loadStreak());
	let currentIndex = $state(0);
	let selectedAnswer = $state<string | number | null>(null);
	let answered = $state(false);
	let answerPoints = $state(0);
	let points = $state<number[]>([]);
	let correctAnswers = $state<boolean[]>([]);
	let shareStatus = $state('');
	let runMode = $state<'daily' | 'unlimited'>('daily');
	let unlimitedEnabled = $state(true);
	let dailyError = $state<string | null>(null);
	const MANIFEST_ATTEMPTS = 3;

	const date = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Europe/Helsinki',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());

	const displayDate = new Intl.DateTimeFormat(intlLocale, {
		day: 'numeric',
		month: 'numeric',
		year: 'numeric'
	}).format(new Date(`${date}T12:00:00`));
	const question = $derived(game?.questions[currentIndex]);
	const currentProduct = $derived(question ? findProduct(productIdFor(question)) : undefined);
	const finished = $derived(saved?.completed === true);
	const totalScore = $derived(saved?.score ?? points.reduce((total, value) => total + value, 0));
	const totalCorrect = $derived(saved?.correct ?? correctAnswers.filter(Boolean).length);
	const showcasedProducts = $derived.by(() => {
		if (!game) return [];
		const ids = game.questions.flatMap((currentQuestion) =>
			currentQuestion.type === 'cheaper' ||
			currentQuestion.type === 'efficiency' ||
			currentQuestion.type === 'attribute'
				? currentQuestion.productIds
				: [currentQuestion.productId]
		);
		return [...new Set(ids)]
			.map((id) => findProduct(id))
			.filter((product): product is PriceListItem => Boolean(product));
	});

	function productIdFor(currentQuestion: Question): string {
		return currentQuestion.type === 'cheaper' ||
			currentQuestion.type === 'efficiency' ||
			currentQuestion.type === 'attribute'
			? currentQuestion.productIds[0]
			: currentQuestion.productId;
	}

	function findProduct(id: string): PriceListItem | undefined {
		const frozen =
			runMode === 'daily' ? pool.find((product) => product[AllColumns.Number] === id) : undefined;
		return frozen ?? products.find((product) => product[AllColumns.Number] === id);
	}

	function productName(id: string) {
		return localizedName(findProduct(id)) ?? m.daily_unknown_product();
	}

	function manufacturerParts(product: PriceListItem | undefined) {
		if (!product) return null;
		const name = localizedName(product);
		const manufacturer = product[AllColumns.Manufacturer];
		if (typeof name !== 'string' || typeof manufacturer !== 'string' || !manufacturer.trim())
			return null;
		const start = name.toLocaleLowerCase().indexOf(manufacturer.toLocaleLowerCase());
		if (start < 0) return null;
		return { before: name.slice(0, start), after: name.slice(start + manufacturer.length) };
	}

	function correctAnswerText(currentQuestion: Question) {
		if (
			currentQuestion.type === 'cheaper' ||
			currentQuestion.type === 'efficiency' ||
			currentQuestion.type === 'attribute'
		)
			return productName(currentQuestion.correctProductId);
		if (currentQuestion.type === 'choice')
			return choiceLabel(currentQuestion.field, currentQuestion.correctValue);
		if (currentQuestion.type === 'price') return price(currentQuestion.correctPrice);
		return price(currentQuestion.correctPrice);
	}

	function initialize(catalog: PriceListItem[]) {
		if (game) return;
		products = catalog;
		unlimitedEnabled =
			LocalStorageManager.getItem(LocalStorageKeys.DailyUnlimitedEnabled) !== false;
		const existing = loadSavedGame(date);
		if (existing) {
			runMode = 'daily';
			saved = existing;
			game = existing.game;
			pool = (existing.products ?? []) as unknown as PriceListItem[];
			currentIndex = existing.currentIndex ?? 0;
			points = existing.points ?? [];
			correctAnswers = existing.correctAnswers ?? [];
			selectedAnswer = existing.selectedAnswer ?? null;
			answered = existing.answered ?? false;
			answerPoints = existing.answerPoints ?? 0;
			streak = loadStreak();
			const unlimited = unlimitedEnabled && existing.completed ? loadUnlimitedProgress() : null;
			if (unlimited) restoreUnlimited(unlimited);
			return;
		}
		clearUnlimitedProgress();
		startDaily(catalog);
	}

	function startDaily(catalog: PriceListItem[]) {
		dailyError = null;
		loadDailyGame(date, catalog)
			.then(({ game: generated, products: frozen }) => {
				game = generated;
				pool = frozen as unknown as PriceListItem[];
				saved = {
					date,
					game: generated,
					products: frozen,
					currentIndex: 0,
					points: [],
					correctAnswers: [],
					answered: false
				};
				saveGame(saved);
			})
			.catch((error) => {
				dailyError = error instanceof Error ? error.message : m.daily_load_failed();
			});
	}

	function isValidManifest(
		value: DailyGameManifest | null,
		date: string
	): value is DailyGameManifest {
		return (
			value !== null &&
			value.version === DAILY_GAME_VERSION &&
			value.date === date &&
			typeof value.seed === 'string' &&
			value.seed.length > 0 &&
			typeof value.gameHash === 'string' &&
			value.gameHash.length > 0 &&
			Array.isArray(value.products) &&
			value.products.length >= 2
		);
	}

	async function loadDailyGame(
		date: string,
		catalog: PriceListItem[]
	): Promise<{ game: GeneratedGame; products: DailyProduct[] }> {
		// The day's questions are pre-baked by the data pipeline into
		// `/daily/<date>.json` so every visitor gets the exact same game and it
		// is already available the moment a new day starts. The file never
		// contains the answers — only a seed, the frozen product pool and the
		// hash of the canonical game — so the game is rebuilt and verified
		// here. Network errors are retried. In production a missing or
		// unverifiable manifest is an error, never a silent local fallback: that
		// fallback would be saved for the whole day and count toward streaks
		// while every other player sees a different game. Dev (no baked files
		// unless `bun run daily --dev`) still falls back to the local generator.
		for (let attempt = 1; attempt <= MANIFEST_ATTEMPTS; attempt++) {
			try {
				const response = await fetch(`${base}/daily/${date}.json`);
				if (response.ok) {
					const manifest = (await response.json()) as DailyGameManifest | null;
					if (isValidManifest(manifest, date)) {
						const game = await reconstructDailyGame(manifest);
						if (game) {
							if (dev) console.info(`[daily] pinned manifest → ${manifest.gameHash} (${date})`);
							return { game, products: manifest.products };
						}
					}
				}
				// A reachable but missing/invalid file will not fix itself on retry.
				if (dev) console.warn(`[daily] manifest rejected (HTTP ${response.status})`);
				break;
			} catch (error) {
				if (dev) console.warn(`[daily] manifest unavailable (attempt ${attempt})`, error);
				if (attempt < MANIFEST_ATTEMPTS)
					await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
			}
		}
		if (dev)
			return {
				game: generateDailyGame(date, catalog, createRng(`alkometriikka-daily-v1-${date}`)),
				products: []
			};
		throw new Error(m.daily_load_failed());
	}

	function restoreUnlimited(state: UnlimitedRunState) {
		runMode = 'unlimited';
		game = state.game;
		saved = {
			date,
			game: state.game,
			currentIndex: state.currentIndex,
			points: state.points,
			correctAnswers: state.correctAnswers,
			selectedAnswer: state.selectedAnswer,
			answered: state.answered,
			answerPoints: state.answerPoints,
			completed: state.completed,
			score: state.score,
			correct: state.correct
		};
		currentIndex = state.currentIndex;
		selectedAnswer = state.selectedAnswer;
		answered = state.answered;
		answerPoints = state.answerPoints;
		points = state.points;
		correctAnswers = state.correctAnswers;
	}

	function persistUnlimitedProgress() {
		if (runMode !== 'unlimited' || !game || !saved) return;
		const state: UnlimitedRunState = {
			game,
			currentIndex,
			selectedAnswer,
			answered,
			answerPoints,
			points,
			correctAnswers,
			completed: saved.completed,
			score: saved.score,
			correct: saved.correct
		};
		saveUnlimitedProgress(state);
	}

	function exitUnlimited() {
		clearUnlimitedProgress();
		shareStatus = '';
		const existing = loadSavedGame(date);
		if (!existing) return;
		runMode = 'daily';
		saved = existing;
		game = existing.game;
		pool = (existing.products ?? []) as unknown as PriceListItem[];
		currentIndex = existing.currentIndex ?? 0;
		points = existing.points ?? [];
		correctAnswers = existing.correctAnswers ?? [];
		selectedAnswer = existing.selectedAnswer ?? null;
		answered = existing.answered ?? false;
		answerPoints = existing.answerPoints ?? 0;
		streak = loadStreak();
	}

	function startUnlimited() {
		if (!unlimitedEnabled || !saved?.completed || !products.length) return;
		const seed = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
		clearUnlimitedProgress();
		runMode = 'unlimited';
		game = generateDailyGame(`${date}-unlimited-${seed}`, products, createRng(seed));
		saved = { date, game, currentIndex: 0, points: [], correctAnswers: [], answered: false };
		currentIndex = 0;
		selectedAnswer = null;
		answered = false;
		answerPoints = 0;
		points = [];
		correctAnswers = [];
		shareStatus = '';
		persistUnlimitedProgress();
	}

	$effect(() => {
		data.alko.then(({ kaljakori }) => initialize(kaljakori.data));
	});

	function answer(value: string | number) {
		if (answered || !question) return;
		if (points.length === 0) {
			sendAnalyticsEvent(runMode === 'daily' ? 'daily_game' : 'unlimited_game', {
				state: 'started',
				date
			});
		}
		selectedAnswer = value;
		answerPoints = questionPoints(question, value);
		points = [...points, answerPoints];
		correctAnswers = [
			...correctAnswers,
			question.type === 'estimate' ? Number(value) === question.correctPrice : answerPoints === 100
		];
		answered = true;
		saved = {
			...saved!,
			currentIndex,
			points,
			correctAnswers,
			selectedAnswer,
			answered,
			answerPoints
		};
		// The answer buttons are now disabled, so move focus to the continue button instead of dropping it.
		tick().then(() => document.getElementById('daily-continue')?.focus());
		if (runMode === 'daily') saveGame(saved);
		else persistUnlimitedProgress();
	}

	function submitEstimate(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		const value = Number(new FormData(form).get('estimate'));
		if (Number.isFinite(value)) answer(value);
	}

	function continueGame() {
		if (!game || !answered) return;
		if (currentIndex === game.questions.length - 1) {
			const score = points.reduce((total, value) => total + value, 0);
			const correct = correctAnswers.filter(Boolean).length;
			saved = { ...saved!, completed: true, score, correct };
			if (runMode === 'daily') {
				saveGame(saved);
				streak = completeGame(saved, score, correct);
				sendAnalyticsEvent('daily_game', {
					state: 'completed',
					date,
					score,
					questions_right: correct
				});
			} else {
				clearUnlimitedProgress();
				sendAnalyticsEvent('unlimited_game', {
					state: 'completed',
					date,
					score,
					questions_right: correct
				});
			}
			return;
		}
		currentIndex += 1;
		selectedAnswer = null;
		answerPoints = 0;
		answered = false;
		saved = {
			...saved!,
			currentIndex,
			points,
			correctAnswers,
			selectedAnswer: null,
			answered: false,
			answerPoints: 0
		};
		if (runMode === 'daily') saveGame(saved);
		else persistUnlimitedProgress();
	}

	function currentOptions(): (string | number)[] {
		if (!question) return [];
		if (question.type === 'price' || question.type === 'choice') return question.options;
		if (question.type === 'estimate') return [];
		return question.productIds;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, dialog, [role="dialog"]')) return;

		if (runMode === 'unlimited' && event.key.toLowerCase() === 'l') {
			event.preventDefault();
			exitUnlimited();
			return;
		}

		if (finished) {
			const key = event.key.toLowerCase();
			if (key === 'enter' && target?.closest('a, button')) return;
			if (key === 'enter' || key === 'n' || key === 'u') {
				if (!unlimitedEnabled) return;
				event.preventDefault();
				startUnlimited();
			} else if (key === 'a') {
				event.preventDefault();
				goto(resolve('/daily/arkisto/'));
			} else if (key === 'escape' || key === 'b') {
				event.preventDefault();
				goto(resolve('/'));
			}
			return;
		}
		if (!game || !question) return;

		if (answered) {
			if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') {
				event.preventDefault();
				continueGame();
			}
			return;
		}

		if (question.type === 'estimate') {
			if (/^[0-9]$/.test(event.key))
				document.querySelector<HTMLInputElement>('input[name="estimate"]')?.focus();
			return;
		}

		const options = currentOptions();
		let index = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
		if (options.length === 2) {
			if (event.key === 'ArrowLeft') index = 0;
			else if (event.key === 'ArrowRight') index = 1;
		}
		if (index >= 0 && index < options.length) {
			event.preventDefault();
			answer(options[index]);
		}
	}

	function answerLabel(value: number) {
		return price(value);
	}

	function isCorrect(value: string | number) {
		if (!question) return false;
		if (question.type === 'price') return Number(value) === question.correctPrice;
		if (question.type === 'estimate') return false;
		if (question.type === 'choice') return value === question.correctValue;
		return value === question.correctProductId;
	}

	function estimateWasExact() {
		return question?.type === 'estimate' && Number(selectedAnswer) === question.correctPrice;
	}

	function resultEmoji(value: number) {
		return value === 100 ? '🟩' : value > 0 ? '🟨' : '🟥';
	}

	function shareText() {
		const grid = points.map(resultEmoji).join('');
		return m.daily_share_text({
			date: displayDate,
			grid,
			correct: totalCorrect,
			total: DAILY_QUESTION_COUNT,
			score: totalScore,
			streak: streak.current
		});
	}

	async function shareResult() {
		const text = shareText();
		const shared = await handleShare({
			type: 'daily_game',
			title: 'Alkometriikka Daily',
			text,
			url: `${window.location.origin}/daily/`,
			includeSID: true
		});
		if (!shared) shareStatus = m.daily_link_copied();
	}

	function resetGame() {
		resetDailyGame();
		location.reload();
	}

	function getFinnishDate() {
		return new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Europe/Helsinki',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(new Date());
	}

	function helsinkiOffsetMinutes(at: Date) {
		const offset =
			new Intl.DateTimeFormat('en-US', {
				timeZone: 'Europe/Helsinki',
				timeZoneName: 'longOffset'
			})
				.formatToParts(at)
				.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+02:00';

		const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/);

		return match ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '+' ? 1 : -1) : 120;
	}

	function timeTillNextDaily() {
		const now = new Date();

		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Europe/Helsinki',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(now);

		const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);

		const year = get('year');
		const month = get('month');
		const day = get('day');

		// Finnish midnight at the start of tomorrow. Use the offset in effect
		// *at* that midnight, not now: on DST change days they differ.
		const nextMidnightUtc = Date.UTC(year, month - 1, day + 1);
		const guess = nextMidnightUtc - helsinkiOffsetMinutes(now) * 60_000;
		const nextDaily = nextMidnightUtc - helsinkiOffsetMinutes(new Date(guess)) * 60_000;
		const diff = Math.max(0, nextDaily - now.getTime());

		const hours = Math.floor(diff / 3_600_000);
		const minutes = Math.floor((diff % 3_600_000) / 60_000);
		const seconds = Math.floor((diff % 60_000) / 1_000);

		// Finnish separates the parts of a time with dots, English and Swedish with colons
		const separator = locale === 'fi' ? '.' : ':';
		return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(separator);
	}

	let dailyDate = getFinnishDate();
	let dailyCountdown = $state(timeTillNextDaily());
	let newDayAvailable = $state(false);
	const dayNumber = dayNumberForDate(date);

	$effect(() => {
		const interval = setInterval(() => {
			const newDate = getFinnishDate();

			dailyCountdown = timeTillNextDaily();

			if (newDate !== dailyDate && !newDayAvailable) {
				// Never yank a half-played run away at midnight: let the player
				// finish (yesterday's game still scores for yesterday) and offer
				// the new day instead of reloading.
				if (points.length > 0 && !saved?.completed) newDayAvailable = true;
				else location.reload();
			}
		}, 1000);
		return () => clearInterval(interval);
	});

	$effect(() =>
		setSEO({
			description: m.daily_seo_description(),
			keywords: m.seo_daily_keywords(),
			og: {
				description: m.daily_seo_description(),
				title: 'Alkometriikka Daily',
				url: window.location.href,
				type: 'website'
			},
			twitter: {
				description: m.daily_seo_description(),
				title: 'Alkometriikka Daily'
			}
		})
	);
</script>

<svelte:head>
	<title>{generateTitle('Daily')}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#await data.alko then alko}
	<main class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8 lg:gap-8 lg:p-10">
		<header class="flex flex-col gap-2 border-b border-primary pb-5">
			<div class="flex items-center justify-between gap-4">
				<div>
					<p class="text-sm font-bold tracking-widest text-brand-2 uppercase">
						Alkometriikka {runMode === 'unlimited' ? 'Daily' : ''}
					</p>
					<div class="flex items-center gap-2">
						<h1 class="text-3xl font-bold md:text-4xl">
							{runMode === 'daily' ? 'Daily' : 'Unlimited'}
						</h1>
						<span
							class="rounded border border-brand-2 px-1.5 py-0.5 text-xs font-bold tracking-wide text-brand-2 uppercase"
							>Beta</span
						>
					</div>
				</div>
				<div class="flex items-center gap-2">
					{#if runMode === 'daily'}
						<span class="rounded bg-brand-4 px-3 py-2 text-sm font-bold text-white"
							>{displayDate}{#if dayNumber}
								· #{dayNumber}{/if}</span
						>
					{/if}
					{#if runMode === 'unlimited'}
						<button class={twMerge(components.button(), 'px-3 py-2')} onclick={exitUnlimited}>
							<span class="flex items-center gap-2">
								<Icon name="exit" />{m.daily_quit()}<kbd
									class="ms-2 hidden h-5 items-center justify-center rounded border border-current px-1 text-[11px] leading-none font-semibold opacity-60 lg:inline-flex"
									>L</kbd
								></span
							>
						</button>
					{/if}
					{#if dev}
						<button
							class={twMerge(components.button({ size: 'xs' }), 'border-red-300 px-2 py-1 text-xs')}
							onclick={resetGame}>{m.daily_reset()}</button
						>
					{/if}
					<DailyFeedback {date} {runMode} {dayNumber} questionIndex={currentIndex} {game} />
				</div>
			</div>
			<p class="text-secondary">{m.daily_intro()}</p>
		</header>

		{#if newDayAvailable}
			<section
				class="flex flex-col items-center justify-between gap-3 rounded border border-brand-2 bg-secondary p-4 sm:flex-row"
			>
				<p class="font-bold">{m.daily_new_day()}</p>
				<button
					class={twMerge(components.button({ type: 'negative', size: 'md' }), 'px-4 py-2')}
					onclick={() => location.reload()}>{m.daily_go_to_new_game()}</button
				>
			</section>
		{/if}

		{#if finished && saved}
			<section
				class="flex flex-col gap-5 rounded border border-primary bg-secondary p-5 text-center md:p-8 lg:p-10"
			>
				<p class="text-sm font-bold tracking-widest text-brand-2 uppercase">
					{runMode === 'daily' ? 'Alkometriikka Daily' : 'Alkometriikka Unlimited'}
				</p>
				<div>
					<p class="text-5xl font-bold">{saved.correct} / {DAILY_QUESTION_COUNT}</p>
					<p class="mt-2 text-2xl font-bold">{m.daily_points({ count: saved.score ?? 0 })}</p>
				</div>
				{#if runMode === 'daily'}
					<p class="text-lg font-bold">🔥 {m.daily_streak({ count: streak.current })}</p>
					<p class="text-secondary">{m.daily_already_played()}</p>
					{#if !newDayAvailable}
						<div>
							<p class="text-sm text-secondary">{m.daily_next_game()}</p>
							<p class="text-lg font-bold">{dailyCountdown}</p>
						</div>
					{/if}
					<p class="text-secondary">{m.daily_practice_hint()}</p>
				{:else}
					<p class="text-secondary">{m.daily_unlimited_not_saved()}</p>
				{/if}
				<section class="border-t border-primary pt-5 text-left">
					<h2 class="text-lg font-bold">
						{runMode === 'daily' ? m.daily_todays_products() : m.daily_rounds_products()}
					</h2>
					<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
						{#each showcasedProducts as product (product[AllColumns.Number])}
							<a
								href={resolve(`/tuotteet/${product[AllColumns.Number]}/`)}
								class="flex min-w-0 items-center gap-2 rounded border border-primary bg-primary p-2 hover:border-brand-2"
							>
								<div class="h-20 w-14 shrink-0 rounded bg-white p-1">
									<ProductImage
										number={product[AllColumns.Number]}
										name={localizedName(product)}
										transform="medium"
									/>
								</div>
								<span class="min-w-0 text-sm">{localizedName(product)}</span>
							</a>
						{/each}
					</div>
				</section>
				<div class="flex flex-col items-center gap-3">
					{#if runMode === 'daily'}
						<button
							class={twMerge(components.button({ type: 'positive', size: 'md' }), 'px-4 py-2')}
							onclick={shareResult}
						>
							<span class="flex items-center gap-2">
								<Icon name="share" />{m.daily_share_result()}</span
							>
						</button>
						{#if shareStatus}<p class="text-left text-sm whitespace-pre-wrap text-secondary">
								{shareStatus}
							</p>{/if}
					{/if}
					<div class="flex w-full max-w-md flex-col items-center gap-2">
						{#if unlimitedEnabled}
							<button
								class={twMerge(
									components.button({ type: 'negative', size: 'md' }),
									'w-full px-4 py-2'
								)}
								onclick={startUnlimited}
							>
								<span class="flex items-center gap-2">
									<Icon name="repeat_alt_2" />{runMode === 'daily'
										? m.daily_play_unlimited()
										: m.daily_new_round()}<kbd
										class="ms-2 hidden h-5 items-center justify-center rounded border border-current px-1 text-[11px] leading-none font-semibold opacity-60 lg:inline-flex"
										>↵</kbd
									></span
								>
							</button>
						{/if}
						<div class="grid w-full grid-cols-2 gap-2">
							<a
								href={resolve('/daily/arkisto/')}
								class={twMerge(components.button({ size: 'md' }), 'w-full px-4 py-2')}
							>
								<span class="flex items-center gap-2">
									<Icon name="archive" />{m.daily_archive()}<kbd
										class="ms-2 hidden h-5 items-center justify-center rounded border border-current px-1 text-[11px] leading-none font-semibold opacity-60 lg:inline-flex"
										>A</kbd
									></span
								>
							</a>
							<a
								href={resolve('/')}
								class={twMerge(components.button({ size: 'md' }), 'w-full px-4 py-2')}
								><span class="flex items-center gap-2"
									>{m.daily_back_to_app()}<kbd
										class="ms-2 hidden h-5 items-center justify-center rounded border border-current px-1 text-[11px] leading-none font-semibold opacity-60 lg:inline-flex"
										>Esc</kbd
									></span
								></a
							>
						</div>
					</div>
				</div>
			</section>
		{:else if game && question}
			{#snippet answerMark(value: string | number)}
				{#if answered && isCorrect(value)}
					<span class="ms-2 inline-flex items-center"
						><Icon name="check_circle" /><span class="sr-only">{m.daily_correct_answer_sr()}</span
						></span
					>
				{:else if answered && selectedAnswer === value}
					<span class="ms-2 inline-flex items-center"
						><Icon name="block" /><span class="sr-only">{m.daily_wrong_answer_sr()}</span></span
					>
				{/if}
			{/snippet}
			<section class="flex flex-col gap-5">
				<div class="flex items-center justify-between text-sm font-bold">
					<span
						>{m.daily_question_progress({
							current: currentIndex + 1,
							total: game.questions.length
						})}</span
					>
					<span class="text-secondary">{m.daily_points({ count: totalScore })}</span>
				</div>
				<div class="h-2 overflow-hidden rounded bg-secondary">
					<div
						class="h-full bg-brand-2 transition-all"
						style={`width: ${((currentIndex + 1) / game.questions.length) * 100}%`}
					></div>
				</div>

				<div class="rounded border border-primary bg-primary p-5 md:p-8 lg:p-10">
					{#if question.type === 'price'}
						<div class="flex items-center gap-4">
							<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
								<ProductImage
									number={question.productId}
									name={localizedName(currentProduct) ?? m.stats_product()}
									transform="medium"
								/>
							</div>
							<div class="min-w-0">
								<p class="text-lg font-bold">{localizedName(currentProduct)}</p>
								<h2 class="mt-2 text-2xl font-bold">{m.daily_question_price()}</h2>
							</div>
						</div>
						<div class="mt-6 grid grid-cols-2 gap-3">
							{#each question.options as option, i (option)}
								<button
									class={twMerge(
										components.button(),
										'relative min-h-12 w-full text-lg',
										answered &&
											(isCorrect(option)
												? 'border-green-600 bg-green-100 text-green-900'
												: selectedAnswer === option
													? 'border-red-600 bg-red-100 text-red-900'
													: 'opacity-60')
									)}
									disabled={answered}
									onclick={() => answer(option)}
									><kbd
										class="pointer-events-none absolute top-1.5 right-1.5 hidden size-5 items-center justify-center rounded border border-current text-[11px] leading-none font-semibold opacity-40 lg:flex"
										>{i + 1}</kbd
									>{answerLabel(option)}{@render answerMark(option)}</button
								>
							{/each}
						</div>
					{:else if question.type === 'cheaper' || question.type === 'efficiency' || question.type === 'attribute'}
						<h2 class="text-2xl font-bold">
							{question.type === 'cheaper'
								? m.daily_question_cheaper()
								: question.type === 'efficiency'
									? m.daily_question_efficiency()
									: attributeTitle(question.metric)}
						</h2>
						<div class="mt-6 grid gap-3 sm:grid-cols-2">
							{#each question.productIds as id, i (id)}
								{@const comparedProduct = findProduct(id)}
								<button
									class={twMerge(
										components.button(),
										'relative min-h-40 w-full justify-start p-3 text-left',
										answered &&
											(isCorrect(id)
												? 'border-green-600 bg-green-100 text-green-900'
												: selectedAnswer === id
													? 'border-red-600 bg-red-100 text-red-900'
													: 'opacity-60')
									)}
									disabled={answered}
									onclick={() => answer(id)}
								>
									<div class="h-32 w-24 shrink-0 rounded bg-white p-1">
										<ProductImage number={id} name={productName(id)} transform="medium" />
									</div>
									<span class="min-w-0"
										><kbd
											class="pointer-events-none absolute top-1.5 right-1.5 hidden size-5 items-center justify-center rounded border border-current text-[11px] leading-none font-semibold opacity-40 lg:flex"
											>{i + 1}</kbd
										>{localizedName(comparedProduct) ?? productName(id)}</span
									>
									{#if answered && question.type === 'efficiency'}<span class="ms-auto text-sm"
											>{efficiency(question.efficiency[id])}</span
										>{/if}
									{#if answered && question.type === 'attribute'}<span class="ms-auto text-sm"
											>{attributeValueLabel(question.metric, question.values[id])}</span
										>{/if}
									{@render answerMark(id)}
								</button>
							{/each}
						</div>
					{:else if question.type === 'choice'}
						{@const titleParts =
							question.field === 'manufacturer' ? manufacturerParts(currentProduct) : null}
						<div class="flex items-center gap-4">
							<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
								<ProductImage
									number={question.productId}
									name={localizedName(currentProduct) ?? m.stats_product()}
									transform="medium"
								/>
							</div>
							<div class="min-w-0">
								<p class="text-lg font-bold">
									{#if titleParts}{titleParts.before}<span class="blur-sm select-none">██████</span
										>{titleParts.after}{:else}{localizedName(currentProduct)}{/if}
								</p>
								<h2 class="mt-2 text-2xl font-bold">{choiceTitle(question.field)}</h2>
							</div>
						</div>
						<div class="mt-6 grid grid-cols-2 gap-3">
							{#each question.options as option, i (option)}
								<button
									class={twMerge(
										components.button(),
										'relative min-h-12 w-full text-left',
										answered &&
											(isCorrect(option)
												? 'border-green-600 bg-green-100 text-green-900'
												: selectedAnswer === option
													? 'border-red-600 bg-red-100 text-red-900'
													: 'opacity-60')
									)}
									disabled={answered}
									onclick={() => answer(option)}
									><kbd
										class="pointer-events-none absolute top-1.5 right-1.5 hidden size-5 items-center justify-center rounded border border-current text-[11px] leading-none font-semibold opacity-40 lg:flex"
										>{i + 1}</kbd
									>{choiceLabel(question.field, option)}{@render answerMark(option)}</button
								>
							{/each}
						</div>
					{:else if question.type === 'estimate'}
						<div class="flex gap-4">
							<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
								<ProductImage
									number={question.productId}
									name={localizedName(currentProduct) ?? m.stats_product()}
									transform="medium"
								/>
							</div>
							<div class="min-w-0">
								<p class="text-lg font-bold">{localizedName(currentProduct)}</p>
								{#if estimateDetails(currentProduct)}<p class="mt-1 text-sm text-secondary">
										{estimateDetails(currentProduct)}
									</p>{/if}
								<p class="mt-2 text-secondary">
									{question.alcoholPercentage}% · {question.volume} L
								</p>
							</div>
						</div>
						<h2 class="mt-5 text-2xl font-bold">{m.daily_question_estimate()}</h2>
						<form class="mt-6 flex flex-col gap-3 sm:flex-row" onsubmit={submitEstimate}>
							<label
								class="flex flex-1 items-center gap-2 rounded border border-primary px-3 py-2 focus-within:outline-1 focus-within:outline-offset-2 focus-within:outline-brand-1"
								><span>€</span><input
									name="estimate"
									class="w-full border-0 bg-transparent text-lg focus:ring-0 focus-visible:outline-none"
									type="number"
									min="0"
									step="0.01"
									required
									disabled={answered}
									aria-label={m.daily_estimate_label()}
								/></label
							>
							<button
								class={twMerge(
									components.button({ type: 'negative', size: 'md' }),
									'justify-center px-5 py-2'
								)}
								disabled={answered}>{m.daily_answer()}</button
							>
						</form>
					{/if}

					{#if answered}
						<div class="mt-6 border-t border-primary pt-5" aria-live="polite">
							<p class="text-lg font-bold">
								{question.type === 'estimate'
									? estimateWasExact()
										? m.daily_correct()
										: answerPoints > 0
											? m.daily_good_estimate()
											: m.daily_not_quite()
									: answerPoints > 0
										? m.daily_correct()
										: m.daily_not_quite()}
								<span class="text-secondary">+{m.daily_points({ count: answerPoints })}</span>
							</p>
							<p class="mt-2 text-secondary">
								{m.daily_correct_answer({ answer: correctAnswerText(question) })}
							</p>
							{#if question.type === 'efficiency'}<p class="mt-1 text-sm text-secondary">
									{m.daily_efficiency_formula()}
								</p>{/if}
							<button
								class={twMerge(
									components.button({ type: 'negative', size: 'md' }),
									'mt-4 px-4 py-2'
								)}
								id="daily-continue"
								onclick={continueGame}
								>{currentIndex === game.questions.length - 1
									? m.daily_show_result()
									: m.daily_continue()}<kbd
									class="ms-2 hidden h-5 items-center justify-center rounded border border-current px-1 text-[11px] leading-none font-semibold opacity-60 lg:inline-flex"
									>↵</kbd
								></button
							>
						</div>
					{/if}
				</div>
			</section>
		{:else if dailyError}
			<section
				class="flex flex-col items-center gap-4 rounded border border-primary bg-secondary p-8 text-center"
			>
				<p class="text-lg font-bold">{dailyError}</p>
				<p class="text-secondary">{m.daily_check_connection()}</p>
				<button
					class={twMerge(components.button({ type: 'negative', size: 'md' }), 'px-4 py-2')}
					onclick={() => startDaily(products)}>{m.common_retry()}</button
				>
			</section>
		{/if}
	</main>
{:catch error}
	<p class="m-auto p-8">{m.daily_load_error({ message: error.message })}</p>
{/await}
