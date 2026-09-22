<script lang="ts">
	import { AllColumns, LocalStorageKeys } from '$lib/utils/constants';
	import { components } from '$lib/utils/styles';
	import type { PriceListItem } from '$lib/types';
	import { createRng } from '$lib/daily/rng';
	import { DAILY_QUESTION_COUNT, generateDailyGame, type GeneratedGame, type Question, type UnlimitedRunState } from '$lib/daily/questions';
	import { questionPoints } from '$lib/daily/scoring';
	import { clearUnlimitedProgress, completeGame, loadSavedGame, loadStreak, loadUnlimitedProgress, resetDailyGame, saveGame, saveUnlimitedProgress, type DailyStreak, type SavedDailyGame } from '$lib/daily/storage';
	import { LocalStorageManager } from '$lib/utils/storage';
	import { dev } from '$app/environment';
	import { generateTitle, handleShare, sendAnalyticsEvent, setSEO } from '$lib/utils/helpers';
	import ProductImage from '$lib/components/widgets/ProductImage.svelte';
	import { twMerge } from 'tailwind-merge';
	import type { PageProps } from './$types';
	import Icon from '$lib/components/widgets/Icon.svelte';

	let { data }: PageProps = $props();
	let products = $state<PriceListItem[]>([]);
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
    
    const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Helsinki',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());	

    const displayDate = new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
	const question = $derived(game?.questions[currentIndex]);
	const currentProduct = $derived(question ? products.find((product) => product[AllColumns.Number] === productIdFor(question)) : undefined);
	const finished = $derived(saved?.completed === true);
	const totalScore = $derived(saved?.score ?? points.reduce((total, value) => total + value, 0));
	const totalCorrect = $derived(saved?.correct ?? correctAnswers.filter(Boolean).length);
	const showcasedProducts = $derived.by(() => {
		if (!game) return [];
		const ids = game.questions.flatMap((currentQuestion) => currentQuestion.type === 'cheaper' || currentQuestion.type === 'efficiency' || currentQuestion.type === 'attribute' ? currentQuestion.productIds : [currentQuestion.productId]);
		return [...new Set(ids)].map((id) => products.find((product) => product[AllColumns.Number] === id)).filter((product): product is PriceListItem => Boolean(product));
	});

	function productIdFor(currentQuestion: Question): string {
		return currentQuestion.type === 'cheaper' || currentQuestion.type === 'efficiency' || currentQuestion.type === 'attribute' ? currentQuestion.productIds[0] : currentQuestion.productId;
	}

	function productName(id: string) {
		return products.find((product) => product[AllColumns.Number] === id)?.[AllColumns.Name] ?? 'Tuntematon tuote';
	}

	function price(value: number) {
		return new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' }).format(value);
	}

	function efficiency(value: number) {
		return `${value.toFixed(2).replace('.', ',')} g/€`;
	}

	function estimateDetails(product: PriceListItem | undefined) {
		if (!product) return '';
		return [
			product[AllColumns.Manufacturer],
			product[AllColumns.Type],
			product[AllColumns.PackagingType]
		]
			.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
			.join(' · ');
	}

	function attributeTitle(metric: 'alcohol' | 'volume' | 'literPrice' | 'sugar' | 'energy') {
		return {
			alcohol: 'Kummassa on enemmän alkoholia?',
			volume: 'Kummassa on suurempi pakkaus?',
			literPrice: 'Kumpi on litrahinnaltaan halvempi?',
			sugar: 'Kummassa on enemmän sokeria?',
			energy: 'Kummassa on enemmän energiaa?',
		}[metric];
	}

	function attributeValueLabel(metric: 'alcohol' | 'volume' | 'literPrice' | 'sugar' | 'energy', value: number) {
		const decimals = metric === 'volume' || metric === 'literPrice' ? 2 : metric === 'alcohol' ? 1 : 0;
		const formatted = value.toFixed(decimals).replace('.', ',');
		return metric === 'alcohol' ? `${formatted} %` : metric === 'volume' ? `${formatted} l` : metric === 'literPrice' ? `${formatted} €/l` : metric === 'sugar' ? `${formatted} g/l` : metric === 'energy' ? `${formatted} kcal/100 ml` : `${formatted} merkintää`;
	}

	function choiceTitle(field: 'country' | 'manufacturer' | 'category') {
		return field === 'country' ? 'Mistä maasta tämä tuote on?' : field === 'manufacturer' ? 'Kuka valmistaa tämän tuotteen?' : 'Mihin kategoriaan tämä tuote kuuluu?';
	}

	function manufacturerParts(product: PriceListItem | undefined) {
		if (!product) return null;
		const name = product[AllColumns.Name];
		const manufacturer = product[AllColumns.Manufacturer];
		if (typeof name !== 'string' || typeof manufacturer !== 'string' || !manufacturer.trim()) return null;
		const start = name.toLocaleLowerCase().indexOf(manufacturer.toLocaleLowerCase());
		if (start < 0) return null;
		return { before: name.slice(0, start), after: name.slice(start + manufacturer.length) };
	}

	function correctAnswerText(currentQuestion: Question) {
		if (currentQuestion.type === 'cheaper' || currentQuestion.type === 'efficiency' || currentQuestion.type === 'attribute') return productName(currentQuestion.correctProductId);
		if (currentQuestion.type === 'choice') return currentQuestion.correctValue;
		if (currentQuestion.type === 'price') return price(currentQuestion.correctPrice);
		return price(currentQuestion.correctPrice);
	}

	function initialize(catalog: PriceListItem[]) {
		if (game) return;
		products = catalog;
		unlimitedEnabled = LocalStorageManager.getItem(LocalStorageKeys.DailyUnlimitedEnabled) !== false;
		const existing = loadSavedGame(date);
		if (existing) {
			runMode = 'daily';
			saved = existing;
			game = existing.game;
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
		const generated = generateDailyGame(date, catalog, createRng(`alkometriikka-daily-v1-${date}`));
		game = generated;
		saved = { date, game: generated, currentIndex: 0, points: [], correctAnswers: [], answered: false };
		saveGame(saved);
	}

	function restoreUnlimited(state: UnlimitedRunState) {
		runMode = 'unlimited';
		game = state.game;
		saved = { date, game: state.game, currentIndex: state.currentIndex, points: state.points, correctAnswers: state.correctAnswers, selectedAnswer: state.selectedAnswer, answered: state.answered, answerPoints: state.answerPoints, completed: state.completed, score: state.score, correct: state.correct };
		currentIndex = state.currentIndex;
		selectedAnswer = state.selectedAnswer;
		answered = state.answered;
		answerPoints = state.answerPoints;
		points = state.points;
		correctAnswers = state.correctAnswers;
	}

	function persistUnlimitedProgress() {
		if (runMode !== 'unlimited' || !game || !saved) return;
		const state: UnlimitedRunState = { game, currentIndex, selectedAnswer, answered, answerPoints, points, correctAnswers, completed: saved.completed, score: saved.score, correct: saved.correct };
		saveUnlimitedProgress(state);
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
			sendAnalyticsEvent(runMode === 'daily' ? 'daily_started' : 'unlimited_game_started', { date });
		}
		selectedAnswer = value;
		answerPoints = questionPoints(question, value);
		points = [...points, answerPoints];
		correctAnswers = [...correctAnswers, question.type === 'estimate' ? Number(value) === question.correctPrice : answerPoints === 100];
		answered = true;
		saved = { ...saved!, currentIndex, points, correctAnswers, selectedAnswer, answered, answerPoints };
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
				sendAnalyticsEvent('daily_completed', { date, score, questions_right: correct });
			} else {
				clearUnlimitedProgress();
				sendAnalyticsEvent('unlimited_game_completed', { date, score, questions_right: correct });
			}
			return;
		}
		currentIndex += 1;
		selectedAnswer = null;
		answerPoints = 0;
		answered = false;
		saved = { ...saved!, currentIndex, points, correctAnswers, selectedAnswer: null, answered: false, answerPoints: 0 };
		if (runMode === 'daily') saveGame(saved);
		else persistUnlimitedProgress();
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

	function shareText() {
		return `🍺 Alkometriikka Daily\n${displayDate}\n\n${totalCorrect}/${DAILY_QUESTION_COUNT} oikein\n${totalScore} pistettä\n🔥 ${streak.current} päivän putki`;
	}

	async function shareResult() {
		const text = shareText();
		const shared = await handleShare({
            type: "daily_game",
			title: 'Alkometriikka Daily',
			text,
			url: `${window.location.origin}/daily/`,
            includeSID: true
		});
		if (!shared) shareStatus = 'Linkki kopioitu leikepöydälle';
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

    function timeTillNextDaily() {
        const now = new Date();

        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Helsinki',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(now);

        const get = (type: string) => Number(
            parts.find(part => part.type === type)?.value
        );

        const year = get('year');
        const month = get('month');
        const day = get('day');

        // Get the current Helsinki UTC offset.
        const offsetParts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Europe/Helsinki',
            timeZoneName: 'longOffset'
        }).formatToParts(now);

        const offset = offsetParts
            .find(part => part.type === 'timeZoneName')
            ?.value ?? 'GMT+02:00';

        const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/);

        const offsetMinutes = match
            ? (Number(match[2]) * 60 + Number(match[3])) *
            (match[1] === '+' ? 1 : -1)
            : 120;

        // Finnish midnight at the start of tomorrow.
        const nextMidnightUtc = Date.UTC(year, month - 1, day + 1);

        const nextDaily = nextMidnightUtc - offsetMinutes * 60_000;
        const diff = Math.max(0, nextDaily - now.getTime());

        const hours = Math.floor(diff / 3_600_000);
        const minutes = Math.floor((diff % 3_600_000) / 60_000);
        const seconds = Math.floor((diff % 60_000) / 1_000);

        return `${String(hours).padStart(2, '0')}.${String(minutes).padStart(2, '0')}.${String(seconds).padStart(2, '0')}`;
    }

    let dailyDate = getFinnishDate();
    let dailyCountdown = $state(timeTillNextDaily());

    setInterval(() => {
        const newDate = getFinnishDate();

        dailyCountdown = timeTillNextDaily();

        if (newDate !== dailyDate) {
            location.reload();
        }
    }, 1000);

    $effect(() => setSEO({
        description: `Alkometriikka Daily on seitsemän kysymyksen tietovisa Alkon valikoimasta. Testaa Alko(holi) tuntemuksesi!`,
        keywords: 'alkometriikka, alkometriikka daily, alkometriikka unlimited, tietovisa, alkometriikka kysymykset, alkometriikka kysymys, daily, game, peli',
        og: {
            description: "Alkometriikka Daily on seitsemän kysymyksen tietovisa Alkon valikoimasta. Testaa Alko(holi) tuntemuksesi!",
            title: "Alkometriikka Daily",
            url: window.location.href,
            type: 'website',
        },
        twitter: {
            description: "Alkometriikka Daily on seitsemän kysymyksen tietovisa Alkon valikoimasta. Testaa Alko(holi) tuntemuksesi!",
            title: "Alkometriikka Daily"
        }
    }));
</script>

<svelte:head>
	<title>{generateTitle('Daily')}</title>
</svelte:head>

{#await data.alko then alko}
	<main class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8 lg:gap-8 lg:p-10">
		<header class="flex flex-col gap-2 border-b border-primary pb-5">
			<div class="flex items-center justify-between gap-4">
				<div>
					<p class="text-sm font-bold uppercase tracking-widest text-brand-2">Alkometriikka</p>
					<div class="flex items-center gap-2">
						<h1 class="text-3xl font-bold md:text-4xl">{runMode === 'daily' ? 'Daily' : 'Unlimited'}</h1>
						<span class="rounded border border-brand-2 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-2">Beta</span>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<span class="rounded bg-brand-4 px-3 py-2 text-sm font-bold text-white">{runMode === 'unlimited' ? 'Rajaton' : displayDate}</span>
					{#if dev}
						<button class={twMerge(components.button({ size: 'xs' }), 'border-red-300 px-2 py-1 text-xs')} onclick={resetGame}>Nollaa peli</button>
					{/if}
				</div>
			</div>
			<p class="text-secondary">Seitsemän kysymystä Alkon valikoimasta. Testaa Alko(holi)tuntemuksesi!</p>
		</header>

		{#if finished && saved}
			<section class="flex flex-col gap-5 rounded border border-primary bg-secondary p-5 text-center md:p-8 lg:p-10">
				<p class="text-sm font-bold uppercase tracking-widest text-brand-2">{runMode === 'daily' ? 'Alkometriikka Daily' : 'Alkometriikka Unlimited'}</p>
				<div>
					<p class="text-5xl font-bold">{saved.correct} / {DAILY_QUESTION_COUNT}</p>
					<p class="mt-2 text-2xl font-bold">{saved.score} pistettä</p>
				</div>
				{#if runMode === 'daily'}
					<p class="text-lg font-bold">🔥 {streak.current} päivän putki</p>
					<p class="text-secondary">Päivän peli on jo suoritettu. Tule takaisin huomenna.</p>
                    <div>
                        <p class="text-sm text-secondary">Seuraava peli aukeaa:</p>
                        <p class="text-lg font-bold">{dailyCountdown}</p>
                    </div>
                    <p class="text-secondary">Voit myös harjoitella Rajaton-tilassa alla olevalla painikkeella.</p>
				{:else}
					<p class="text-secondary">Rajattoman kierroksen tulosta ei tallennettu.</p>
				{/if}
				<section class="border-t border-primary pt-5 text-left">
					<h2 class="text-lg font-bold">{runMode === 'daily' ? 'Tämän päivän tuotteet' : 'Tämän kierroksen tuotteet'}</h2>
					<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
						{#each showcasedProducts as product (product[AllColumns.Number])}
							<a href={`/tuotteet/${product[AllColumns.Number]}/`} class="flex min-w-0 items-center gap-2 rounded border border-primary bg-primary p-2 hover:border-brand-2">
								<div class="h-20 w-14 shrink-0 rounded bg-white p-1">
									<ProductImage number={product[AllColumns.Number]} name={product[AllColumns.Name]} transform="medium" />
								</div>
								<span class="min-w-0 text-sm">{product[AllColumns.Name]}</span>
							</a>
						{/each}
					</div>
				</section>
				<div class="flex flex-wrap justify-center gap-2">
					{#if runMode === 'daily'}
						<button class={twMerge(components.button({ type: 'negative', size: 'md' }), 'px-4 py-2')} onclick={shareResult}> <span class="flex items-center gap-2"> <Icon name="share"/>Jaa tulos</span> </button>
					{/if}
					{#if unlimitedEnabled}
						<button class={twMerge(components.button({ type: 'negative', size: 'md' }), 'px-4 py-2')} onclick={startUnlimited}> <span class="flex items-center gap-2"> <Icon name="repeat_alt_2"/>{runMode === 'daily' ? 'Pelaa rajattomasti' : 'Uusi kierros'}</span> </button>
					{/if}
					<a href="/" class={twMerge(components.button({ size: 'md' }), 'px-4 py-2')}>Takaisin Alkometriikkaan</a>
				</div>
				{#if shareStatus}<p class="whitespace-pre-wrap text-left text-sm text-secondary">{shareStatus}</p>{/if}
			</section>
		{:else if game && question}
			<section class="flex flex-col gap-5">
				<div class="flex items-center justify-between text-sm font-bold">
					<span>Kysymys {currentIndex + 1} / {game.questions.length}</span>
					<span class="text-secondary">{totalScore} pistettä</span>
				</div>
				<div class="h-2 overflow-hidden rounded bg-secondary"><div class="h-full bg-brand-2 transition-all" style={`width: ${((currentIndex + 1) / game.questions.length) * 100}%`}></div></div>

				<div class="rounded border border-primary bg-primary p-5 md:p-8 lg:p-10">
					{#if question.type === 'price'}
						<div class="flex items-center gap-4">
							<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
								<ProductImage number={question.productId} name={currentProduct?.[AllColumns.Name] ?? 'Tuote'} transform="medium" />
							</div>
							<div class="min-w-0">
								<p class="text-lg font-bold">{currentProduct?.[AllColumns.Name]}</p>
								<h2 class="mt-2 text-2xl font-bold">Paljonko tämä tuote maksaa?</h2>
							</div>
						</div>
						<div class="mt-6 grid grid-cols-2 gap-3">
							{#each question.options as option (option)}
								<button class={twMerge(components.button(), 'min-h-12 w-full text-lg', answered && (isCorrect(option) ? 'border-green-600 bg-green-100 text-green-900' : selectedAnswer === option ? 'border-red-600 bg-red-100 text-red-900' : 'opacity-60'))} disabled={answered} onclick={() => answer(option)}>{answerLabel(option)}</button>
							{/each}
						</div>
					{:else if question.type === 'cheaper' || question.type === 'efficiency' || question.type === 'attribute'}
						<h2 class="text-2xl font-bold">{question.type === 'cheaper' ? 'Kumpi tuote on halvempi?' : question.type === 'efficiency' ? 'Kummasta saat enemmän puhdasta alkoholia eurolla?' : attributeTitle(question.metric)}</h2>
						<div class="mt-6 grid gap-3 sm:grid-cols-2">
							{#each question.productIds as id (id)}
								{@const comparedProduct = products.find((product) => product[AllColumns.Number] === id)}
								<button class={twMerge(components.button(), 'min-h-40 w-full justify-start p-3 text-left', answered && (isCorrect(id) ? 'border-green-600 bg-green-100 text-green-900' : selectedAnswer === id ? 'border-red-600 bg-red-100 text-red-900' : 'opacity-60'))} disabled={answered} onclick={() => answer(id)}>
									<div class="h-32 w-24 shrink-0 rounded bg-white p-1">
										<ProductImage number={id} name={productName(id)} transform="medium" />
									</div>
									<span class="min-w-0">{comparedProduct?.[AllColumns.Name] ?? productName(id)}</span>
									{#if answered && question.type === 'efficiency'}<span class="ms-auto text-sm">{efficiency(question.efficiency[id])}</span>{/if}
									{#if answered && question.type === 'attribute'}<span class="ms-auto text-sm">{attributeValueLabel(question.metric, question.values[id])}</span>{/if}
								</button>
							{/each}
						</div>
					{:else if question.type === 'choice'}
						{@const titleParts = question.field === 'manufacturer' ? manufacturerParts(currentProduct) : null}
						<div class="flex items-center gap-4">
							<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
								<ProductImage number={question.productId} name={currentProduct?.[AllColumns.Name] ?? 'Tuote'} transform="medium" />
							</div>
							<div class="min-w-0">
								<p class="text-lg font-bold">
									{#if titleParts}{titleParts.before}<span class="select-none blur-sm">██████</span>{titleParts.after}{:else}{currentProduct?.[AllColumns.Name]}{/if}
								</p>
								<h2 class="mt-2 text-2xl font-bold">{choiceTitle(question.field)}</h2>
							</div>
						</div>
						<div class="mt-6 grid grid-cols-2 gap-3">
							{#each question.options as option (option)}
								<button class={twMerge(components.button(), 'min-h-12 w-full text-left', answered && (isCorrect(option) ? 'border-green-600 bg-green-100 text-green-900' : selectedAnswer === option ? 'border-red-600 bg-red-100 text-red-900' : 'opacity-60'))} disabled={answered} onclick={() => answer(option)}>{option}</button>
							{/each}
						</div>
					{:else if question.type === 'estimate'}
						<div class="flex gap-4">
							<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
								<ProductImage number={question.productId} name={currentProduct?.[AllColumns.Name] ?? 'Tuote'} transform="medium" />
							</div>
							<div class="min-w-0">
								<p class="text-lg font-bold">{currentProduct?.[AllColumns.Name]}</p>
								{#if estimateDetails(currentProduct)}<p class="mt-1 text-sm text-secondary">{estimateDetails(currentProduct)}</p>{/if}
								<p class="mt-2 text-secondary">{question.alcoholPercentage}% · {question.volume} L</p>
							</div>
						</div>
						<h2 class="mt-5 text-2xl font-bold">Arvaa tuotteen hinta</h2>
						<form class="mt-6 flex flex-col gap-3 sm:flex-row" onsubmit={submitEstimate}>
							<label class="flex flex-1 items-center gap-2 rounded border border-primary px-3 py-2"><span>€</span><input name="estimate" class="w-full border-0 bg-transparent text-lg focus:ring-0" type="number" min="0" step="0.01" required disabled={answered} aria-label="Arvioitu hinta" /></label>
							<button class={twMerge(components.button({ type: 'negative', size: 'md' }), 'justify-center px-5 py-2')} disabled={answered}>Vastaa</button>
						</form>
					{/if}

					{#if answered}
						<div class="mt-6 border-t border-primary pt-5" aria-live="polite">
							<p class="text-lg font-bold">{question.type === 'estimate' ? (estimateWasExact() ? 'Oikein!' : answerPoints > 0 ? 'Hyvä arvio!' : 'Ei aivan.') : answerPoints > 0 ? 'Oikein!' : 'Ei aivan.'} <span class="text-secondary">+{answerPoints} pistettä</span></p>
							<p class="mt-2 text-secondary">Oikea vastaus: {correctAnswerText(question)}</p>
							{#if question.type === 'efficiency'}<p class="mt-1 text-sm text-secondary">Lasku: tilavuus × alkoholiprosentti × 10 / hinta.</p>{/if}
							<button class={twMerge(components.button({ type: 'negative', size: 'md' }), 'mt-4 px-4 py-2')} onclick={continueGame}>{currentIndex === game.questions.length - 1 ? 'Näytä tulos' : 'Jatka'}</button>
						</div>
					{/if}
				</div>
			</section>
		{/if}
	</main>
{:catch error}
	<p class="m-auto p-8">Päiväpeliä ei voitu ladata: {error.message}</p>
{/await}