<script lang="ts">
	import { AllColumns } from '$lib/utils/constants';
	import { components } from '$lib/utils/styles';
	import { questionPoints } from '$lib/daily/scoring';
	import type {
		ArchivedScores,
		ArchiveRunState,
		ArchiveRuns,
		Question
	} from '$lib/daily/questions';
	import {
		loadArchivedScores,
		loadArchiveRuns,
		recordArchivedScore,
		saveArchiveRuns
	} from '$lib/daily/storage';
	import type { ArchiveGame, ArchiveIndex, ArchiveProduct } from '$lib/daily/manifest';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { generateTitle, setSEO } from '$lib/utils/helpers';
	import ProductImage from '$lib/components/widgets/ProductImage.svelte';
	import { twMerge } from 'tailwind-merge';
	import Icon from '$lib/components/widgets/Icon.svelte';

	const date = $derived(page.params.date ?? '');
	const dateFormatter = new Intl.DateTimeFormat('fi-FI', {
		day: 'numeric',
		month: 'numeric',
		year: 'numeric'
	});

	let index = $state<ArchiveIndex | null>(null);
	let archive = $state<ArchiveGame | null>(null);
	let loadError = $state<string | null>(null);
	let runs: ArchiveRuns = $state(loadArchiveRuns());
	let scores: ArchivedScores = $state(loadArchivedScores());
	let requestId = 0;

	const productMap = $derived(
		new Map<string, ArchiveProduct>(
			(archive?.products ?? []).map((product) => [product[AllColumns.Number], product])
		)
	);
	const run = $derived(date ? (runs[date] ?? null) : null);
	// Days completed live are read-only here: show the answers, never a replay.
	const playedLive = $derived(date ? scores[date]?.live === true : false);
	const completed = $derived(playedLive || run?.completed === true);
	const result = $derived(
		!playedLive && run?.completed ? { score: run.score, correct: run.correct } : scores[date]
	);
	const questionIndex = $derived(run?.currentIndex ?? 0);
	const question = $derived(archive?.game.questions[questionIndex]);
	const runningTotal = $derived(run?.points.reduce((total, value) => total + value, 0) ?? 0);
	const answeredCorrectly = $derived(
		run?.answered === true && run.correctAnswers[run.currentIndex] === true
	);
	const lastQuestion = $derived(archive ? questionIndex === archive.game.questions.length - 1 : false);
	const progressPercent = $derived(
		archive ? ((questionIndex + 1) / archive.game.questions.length) * 100 : 0
	);

	const archivedDates = $derived(index?.dates ?? []);
	const currentIndex = $derived(archivedDates.indexOf(date));
	const previousDate = $derived(currentIndex >= 0 ? archivedDates[currentIndex + 1] : undefined);
	const nextDate = $derived(currentIndex > 0 ? archivedDates[currentIndex - 1] : undefined);

	$effect(() => {
		if (!date) return;
		void loadArchive(date);
		void loadIndex();
	});

	async function loadArchive(forDate: string) {
		const id = ++requestId;
		archive = null;
		loadError = null;
		try {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(forDate)) throw new Error('Päivää ei ole vielä arkistoitu');
			const response = await fetch(`${base}/daily/archive/${forDate}.json`);
			if (response.status === 404) throw new Error('Päivää ei ole vielä arkistoitu');
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			let parsed: ArchiveGame;
			try {
				parsed = await response.json();
			} catch {
				throw new Error('Päivää ei ole vielä arkistoitu');
			}
			if (!parsed || parsed.date !== forDate || !Array.isArray(parsed.game?.questions))
				throw new Error('Virheellinen arkistotiedosto');
			if (id !== requestId) return;
			archive = parsed;
		} catch (error) {
			if (id !== requestId) return;
			loadError = error instanceof Error ? error.message : 'Päivää ei voitu ladata';
		}
	}

	async function loadIndex() {
		try {
			const response = await fetch(`${base}/daily/archive/index.json`);
			if (response.status !== 200) {
				index = { version: 1, dates: [] };
				return;
			}
			const parsed = (await response.json()) as ArchiveIndex;
			if (!parsed || !Array.isArray(parsed.dates)) {
				index = { version: 1, dates: [] };
				return;
			}
			index = parsed;
		} catch {
			index = { version: 1, dates: [] };
		}
	}

	function formatDate(value: string) {
		return dateFormatter.format(new Date(`${value}T12:00:00`));
	}

	function shortDate(value: string) {
		const [year, month, day] = value.split('-').map(Number);
		return `${day}.${month}.`;
	}

	function price(value: number) {
		return new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR' }).format(value);
	}

	function productName(id: string) {
		return productMap.get(id)?.[AllColumns.Name] ?? 'Tuntematon tuote';
	}

	function estimatedWith(product: ArchiveProduct | undefined) {
		if (!product) return '';
		return [
			product[AllColumns.Manufacturer],
			product[AllColumns.Type],
			product[AllColumns.PackagingType]
		]
			.filter((value) => typeof value === 'string' && value.trim().length > 0)
			.join(' · ');
	}

	function attributeTitle(metric: 'alcohol' | 'volume' | 'literPrice' | 'sugar' | 'energy') {
		return {
			alcohol: 'Kummassa on enemmän alkoholia?',
			volume: 'Kummassa on suurempi pakkaus?',
			literPrice: 'Kumpi on litrahinnaltaan halvempi?',
			sugar: 'Kummassa on enemmän sokeria?',
			energy: 'Kummassa on enemmän energiaa?'
		}[metric];
	}

	function attributeValueLabel(
		metric: 'alcohol' | 'volume' | 'literPrice' | 'sugar' | 'energy',
		value: number
	) {
		const decimals = metric === 'volume' || metric === 'literPrice' ? 2 : metric === 'alcohol' ? 1 : 0;
		const formatted = value.toFixed(decimals).replace('.', ',');
		return metric === 'alcohol'
			? `${formatted} %`
			: metric === 'volume'
				? `${formatted} l`
				: metric === 'literPrice'
					? `${formatted} €/l`
					: metric === 'sugar'
						? `${formatted} g/l`
						: `${formatted} kcal/100 ml`;
	}

	function pairTitle(currentQuestion: Question) {
		if (currentQuestion.type === 'cheaper') return 'Kumpi tuote on halvempi?';
		if (currentQuestion.type === 'efficiency')
			return 'Kummasta saat enemmän puhdasta alkoholia eurolla?';
		if (currentQuestion.type === 'attribute') return attributeTitle(currentQuestion.metric);
		if (currentQuestion.type === 'price') return 'Paljonko tämä tuote maksaa?';
		if (currentQuestion.type === 'estimate') return 'Arvaa tuotteen hinta';
		return 'Kumpi tuote on halvempi?';
	}

	function choiceTitle(field: 'country' | 'manufacturer' | 'category') {
		return field === 'country'
			? 'Mistä maasta tämä tuote on?'
			: field === 'manufacturer'
				? 'Kuka valmistaa tämän tuotteen?'
				: 'Mihin kategoriaan tämä tuote kuuluu?';
	}

	function correctAnswerLabel(currentQuestion: Question) {
		if (currentQuestion.type === 'price') return price(currentQuestion.correctPrice);
		if (currentQuestion.type === 'cheaper')
			return `Halvempi: ${productName(currentQuestion.correctProductId)}`;
		if (currentQuestion.type === 'efficiency')
			return `Enemmän alkoholia/euro: ${productName(currentQuestion.correctProductId)}`;
		if (currentQuestion.type === 'attribute')
			return `${productName(currentQuestion.correctProductId)}, ${attributeValueLabel(
				currentQuestion.metric,
				currentQuestion.values[currentQuestion.correctProductId]
			)}`;
		if (currentQuestion.type === 'choice') return currentQuestion.correctValue;
		return price(currentQuestion.correctPrice);
	}

	function updateRun(patch: Partial<ArchiveRunState>) {
		if (!date) return;
		const base: ArchiveRunState = runs[date] ?? {
			date,
			currentIndex: 0,
			points: [],
			correctAnswers: [],
			selectedAnswer: null,
			answered: false,
			answerPoints: 0
		};
		runs = { ...runs, [date]: { ...base, ...patch } };
		saveArchiveRuns(runs);
	}

	function answer(value: string | number) {
		if (!question || run?.answered || playedLive) return;
		const points = questionPoints(question, value);
		const correct =
			question.type === 'estimate' ? Number(value) === question.correctPrice : points === 100;
		updateRun({
			selectedAnswer: value,
			answered: true,
			answerPoints: points,
			points: [...(run?.points ?? []), points],
			correctAnswers: [...(run?.correctAnswers ?? []), correct]
		});
	}

	function submitEstimate(event: SubmitEvent) {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		const value = Number(new FormData(form).get('estimate'));
		if (Number.isFinite(value)) answer(value);
	}

	function continueGame() {
		if (!run || !archive || !date) return;
		if (run.currentIndex === archive.game.questions.length - 1) {
			const score = run.points.reduce((total, value) => total + value, 0);
			const correct = run.correctAnswers.filter(Boolean).length;
			updateRun({ completed: true, score, correct });
			// Replays must not overwrite the result from playing the day live.
			if (!loadArchivedScores()[date]) recordArchivedScore(date, score, correct);
			scores = loadArchivedScores();
			return;
		}
		updateRun({
			currentIndex: run.currentIndex + 1,
			selectedAnswer: null,
			answered: false,
			answerPoints: 0
		});
	}

	$effect(() =>
		setSEO({
			description: date
				? `Alkometriikka Daily ${formatDate(date)}: pelaa tai katso vastaukset.`
				: 'Alkometriikka Daily -arkisto.',
			keywords: 'alkometriikka, daily, arkisto, vastaukset, tietovisa',
			og: {
				description: `Alkometriikka Daily ${date ? formatDate(date) : '-arkisto'}.`,
				title: date ? `Arkisto · ${date}` : 'Arkisto',
				url: window.location.href,
				type: 'website'
			},
			twitter: { description: 'Alkometriikka Daily -arkisto', title: 'Arkisto' }
		})
	);
</script>

<svelte:head>
	<title>{generateTitle(date ? `Arkisto · ${date}` : 'Arkisto')}</title>
</svelte:head>

<main class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8 lg:gap-8 lg:p-10">
	<header class="flex flex-col gap-2 border-b border-primary pb-5">
		<div class="flex items-center justify-between gap-4">
			<a href="/daily/arkisto">
				<button class={twMerge(components.button(), 'px-3 py-2')}>
					<span class="flex items-center gap-2"><Icon name="calendar" />Kalenteri</span>
				</button>
			</a>
			{#if archive}
				<div class="flex items-center gap-2">
					{#if previousDate}
						<a href={`${base}/daily/arkisto/${previousDate}`}>
							<button class={twMerge(components.button(), 'px-3 py-2')} aria-label="Edellinen päivä">
								<Icon name="chevron_left" />{shortDate(previousDate)}
							</button>
						</a>
					{/if}
					{#if nextDate}
						<a href={`${base}/daily/arkisto/${nextDate}`}>
							<button class={twMerge(components.button(), 'px-3 py-2')} aria-label="Seuraava päivä">
								{shortDate(nextDate)}<Icon name="chevron_right" />
							</button>
						</a>
					{/if}
				</div>
			{/if}
		</div>
		<div>
			<p class="text-sm font-bold uppercase tracking-widest text-brand-2">Alkometriikka Daily</p>
			<div class="flex items-center gap-2">
				<h1 class="text-3xl font-bold md:text-4xl">{date ? formatDate(date) : 'Arkisto'}</h1>
			</div>
		</div>
	</header>

	{#if loadError && !archive}
		<section class="flex flex-col items-center gap-4 rounded border border-primary bg-secondary p-8 text-center">
			<p class="text-lg font-bold">{loadError}</p>
			<a href="/daily/arkisto">
				<button class={twMerge(components.button({ type: 'negative', size: 'md' }), 'px-4 py-2')}>
					Takaisin kalenteriin
				</button>
			</a>
		</section>
	{:else if !archive}
		<section class="rounded border border-primary bg-secondary p-5 text-center">
			<p>Ladataan päivää…</p>
		</section>
	{:else if completed}
		<section class="flex flex-col gap-5">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-bold">Tulokset</h2>
				{#if scores[date]}
					<a href="/daily/arkisto">
						<button class={twMerge(components.button(), 'px-3 py-2')}>Kalenteri</button>
					</a>
				{/if}
			</div>
			<section class="flex flex-col gap-5 rounded border border-primary bg-secondary p-5 text-center md:p-8">
				<p class="text-lg font-bold">
					{result?.correct}/{archive.game.questions.length} oikein ·{' '}
					{result?.score} pistettä
				</p>
				<p class="text-secondary">
					{playedLive
						? 'Pelasit tämän päivän pelin sen ollessa päivän peli, joten sitä ei voi pelata uudelleen — vastaukset alla.'
						: 'Päivä pelattu loppuun — vastaukset alla.'}
				</p>
			</section>
			{#each archive.game.questions as currentQuestion, questionIndex (questionIndex)}
				<div class="rounded border border-primary bg-primary p-5 md:p-8">
					<div class="flex items-center justify-between text-sm font-bold">
						<span>Kysymys {questionIndex + 1} / {archive.game.questions.length}</span>
						<span class="text-secondary">Vastaus</span>
					</div>
					<div class="mt-4">
						{#if currentQuestion.type === 'price'}
							<div class="flex items-center gap-4">
								<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
									<ProductImage
										number={currentQuestion.productId}
										name={productMap.get(currentQuestion.productId)?.[AllColumns.Name] ?? 'Tuote'}
										transform="medium"
									/>
								</div>
								<div class="min-w-0">
									<p class="text-lg font-bold">{productName(currentQuestion.productId)}</p>
									<h3 class="mt-2 text-xl font-bold">Paljonko tämä tuote maksaa?</h3>
								</div>
							</div>
							<div class="mt-6 grid grid-cols-2 gap-3">
								{#each currentQuestion.options as option (option)}
									{@const correct = Number(option) === currentQuestion.correctPrice}
									<div
										class={twMerge(
											components.button(),
											'min-h-12 w-full justify-center text-lg',
											correct ? 'border-green-600 bg-green-100 text-green-900' : 'opacity-70'
										)}
									>
										{price(option)}
										{#if correct}<Icon name="check_circle" />{/if}
									</div>
								{/each}
							</div>
						{:else if currentQuestion.type === 'cheaper' || currentQuestion.type === 'efficiency' || currentQuestion.type === 'attribute'}
							<h3 class="text-xl font-bold">{pairTitle(currentQuestion)}</h3>
							<div class="mt-6 grid gap-3 sm:grid-cols-2">
								{#each currentQuestion.productIds as id (id)}
									{@const correct = id === currentQuestion.correctProductId}
									<div
										class={twMerge(
											components.button(),
											'min-h-40 w-full justify-start p-3 text-left',
											correct ? 'border-green-600 bg-green-100 text-green-900' : 'opacity-70'
										)}
									>
										<div class="h-32 w-24 shrink-0 rounded bg-white p-1">
											<ProductImage number={id} name={productName(id)} transform="medium" />
										</div>
										<span class="min-w-0">{productName(id)}</span>
										{#if correct}<Icon name="check_circle" />{/if}
									</div>
								{/each}
							</div>
							{#if currentQuestion.type === 'attribute'}
								<p class="mt-3 text-sm text-secondary">
									{attributeValueLabel(
										currentQuestion.metric,
										currentQuestion.values[currentQuestion.correctProductId]
									)}
								</p>
							{/if}
						{:else if currentQuestion.type === 'choice'}
							<div class="flex items-center gap-4">
								<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
									<ProductImage
										number={currentQuestion.productId}
										name={productMap.get(currentQuestion.productId)?.[AllColumns.Name] ?? 'Tuote'}
										transform="medium"
									/>
								</div>
								<div class="min-w-0">
									<p class="text-lg font-bold">{productName(currentQuestion.productId)}</p>
									<h3 class="mt-2 text-xl font-bold">{choiceTitle(currentQuestion.field)}</h3>
								</div>
							</div>
							<div class="mt-6 grid grid-cols-2 gap-3">
								{#each currentQuestion.options as option (option)}
									{@const correct = option === currentQuestion.correctValue}
									<div
										class={twMerge(
											components.button(),
											'min-h-12 w-full justify-start text-left',
											correct ? 'border-green-600 bg-green-100 text-green-900' : 'opacity-70'
										)}
									>
										{option}
										{#if correct}<Icon name="check_circle" />{/if}
									</div>
								{/each}
							</div>
						{:else if currentQuestion.type === 'estimate'}
							<div class="flex gap-4">
								<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
									<ProductImage
										number={currentQuestion.productId}
										name={productMap.get(currentQuestion.productId)?.[AllColumns.Name] ?? 'Tuote'}
										transform="medium"
									/>
								</div>
								<div class="min-w-0">
									<p class="text-lg font-bold">{productName(currentQuestion.productId)}</p>
									{#if estimatedWith(productMap.get(currentQuestion.productId))}
										<p class="mt-1 text-sm text-secondary">
											{estimatedWith(productMap.get(currentQuestion.productId))}
										</p>
									{/if}
									<p class="mt-2 text-secondary">
										{currentQuestion.alcoholPercentage}% · {currentQuestion.volume} L
									</p>
								</div>
							</div>
							<h3 class="mt-5 text-xl font-bold">Arvaa tuotteen hinta</h3>
							<div class="mt-6 rounded border border-green-600 bg-green-100 p-3 text-lg font-bold text-green-900">
								<span class="flex items-center gap-2">
									<Icon name="check_circle" />Oikea hinta: {price(currentQuestion.correctPrice)}
								</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</section>
	{:else if question}
		<section class="flex flex-col gap-5">
			<div class="flex items-center justify-between text-sm font-bold">
				<span>Kysymys {questionIndex + 1} / {archive.game.questions.length}</span>
				<span class="text-secondary">{runningTotal} pistettä</span>
			</div>
			<div class="h-2 overflow-hidden rounded bg-secondary">
				<div
					class="h-full bg-brand-2 transition-all"
					style={`width: ${progressPercent}%`}
				></div>
			</div>

			<div class="rounded border border-primary bg-primary p-5 md:p-8 lg:p-10">
				{#if question.type === 'price'}
					<div class="flex items-center gap-4">
						<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
							<ProductImage
								number={question.productId}
								name={productMap.get(question.productId)?.[AllColumns.Name] ?? 'Tuote'}
								transform="medium"
							/>
						</div>
						<div class="min-w-0">
							<p class="text-lg font-bold">{productName(question.productId)}</p>
							<h2 class="mt-2 text-2xl font-bold">Paljonko tämä tuote maksaa?</h2>
						</div>
					</div>
					<div class="mt-6 grid grid-cols-2 gap-3">
						{#each question.options as option (option)}
							<button
								class={twMerge(components.button(), 'min-h-12 w-full text-lg')}
								disabled={run?.answered}
								onclick={() => answer(option)}
							>
								{price(option)}
							</button>
						{/each}
					</div>
				{:else if question.type === 'cheaper' || question.type === 'efficiency' || question.type === 'attribute'}
					<h2 class="text-2xl font-bold">{pairTitle(question)}</h2>
					<div class="mt-6 grid gap-3 sm:grid-cols-2">
						{#each question.productIds as id (id)}
							<button
								class={twMerge(components.button(), 'min-h-40 w-full justify-start p-3 text-left')}
								disabled={run?.answered}
								onclick={() => answer(id)}
							>
								<div class="h-32 w-24 shrink-0 rounded bg-white p-1">
									<ProductImage number={id} name={productName(id)} transform="medium" />
								</div>
								<span class="min-w-0">{productName(id)}</span>
							</button>
						{/each}
					</div>
				{:else if question.type === 'choice'}
					<div class="flex items-center gap-4">
						<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
							<ProductImage
								number={question.productId}
								name={productMap.get(question.productId)?.[AllColumns.Name] ?? 'Tuote'}
								transform="medium"
							/>
						</div>
						<div class="min-w-0">
							<p class="text-lg font-bold">{productName(question.productId)}</p>
							<h2 class="mt-2 text-2xl font-bold">{choiceTitle(question.field)}</h2>
						</div>
					</div>
					<div class="mt-6 grid grid-cols-2 gap-3">
						{#each question.options as option (option)}
							<button
								class={twMerge(components.button(), 'min-h-12 w-full text-left')}
								disabled={run?.answered}
								onclick={() => answer(option)}
							>
								{option}
							</button>
						{/each}
					</div>
				{:else if question.type === 'estimate'}
					<div class="flex gap-4">
						<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
							<ProductImage
								number={question.productId}
								name={productMap.get(question.productId)?.[AllColumns.Name] ?? 'Tuote'}
								transform="medium"
							/>
						</div>
						<div class="min-w-0">
							<p class="text-lg font-bold">{productName(question.productId)}</p>
							{#if estimatedWith(productMap.get(question.productId))}
								<p class="mt-1 text-sm text-secondary">
									{estimatedWith(productMap.get(question.productId))}
								</p>
							{/if}
							<p class="mt-2 text-secondary">{question.alcoholPercentage}% · {question.volume} L</p>
						</div>
					</div>
					<h2 class="mt-5 text-2xl font-bold">Arvaa tuotteen hinta</h2>
					<form class="mt-6 flex flex-col gap-3 sm:flex-row" onsubmit={submitEstimate}>
						<label class="flex flex-1 items-center gap-2 rounded border border-primary px-3 py-2">
							<span>€</span>
							<input
								name="estimate"
								class="w-full border-0 bg-transparent text-lg focus:ring-0"
								type="number"
								min="0"
								step="0.01"
								required
								disabled={run?.answered}
								aria-label="Arvioitu hinta"
							/>
						</label>
						<button
							class={twMerge(components.button({ type: 'negative', size: 'md' }), 'justify-center px-5 py-2')}
							disabled={run?.answered}
						>
							Vastaa
						</button>
					</form>
				{/if}

				{#if run?.answered}
					<div class="mt-6 border-t border-primary pt-5" aria-live="polite">
						{#if answeredCorrectly}
							<p class="flex items-center gap-2 text-lg font-bold text-green-700">
								<Icon name="check_circle" />
								Oikein! <span class="text-secondary">+{run.answerPoints} pistettä</span>
							</p>
						{:else if question.type === 'estimate' && run.answerPoints > 0}
							<p class="flex items-center gap-2 text-lg font-bold text-green-700">
								<Icon name="check_circle" />
								Hyvä arvio! <span class="text-secondary">+{run.answerPoints} pistettä</span>
							</p>
						{:else}
							<p class="flex items-center gap-2 text-lg font-bold text-red-700">
								<Icon name="block" />
								Väärin <span class="text-secondary">· {run.answerPoints} pistettä</span>
							</p>
						{/if}
						<p class="mt-2 text-secondary">Oikea vastaus: {correctAnswerLabel(question)}</p>
						<button
							class={twMerge(components.button({ type: 'negative', size: 'md' }), 'mt-4 px-4 py-2')}
							onclick={continueGame}
						>
							{lastQuestion ? 'Näytä tulokset' : 'Seuraava kysymys'}
						</button>
					</div>
				{/if}
			</div>
		</section>
	{/if}
</main>