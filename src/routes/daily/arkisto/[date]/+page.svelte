<script lang="ts">
	import { productName as localizedName } from '$lib/i18n/values';
	import { asset, resolve } from '$app/paths';
	import { tick } from 'svelte';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { components } from '$lib/utils/ui/styles';
	import { questionPoints } from '$lib/daily/scoring';
	import type { Question } from '$lib/daily/questions';
	import type { ArchivedScores, ArchiveRunState, ArchiveRuns } from '$lib/daily/types';
	import {
		loadArchivedScores,
		loadArchiveRuns,
		recordArchivedScore,
		saveArchiveRuns
	} from '$lib/daily/storage';
	import type { ArchiveGame, ArchiveIndex, ArchiveProduct } from '$lib/daily/manifest';
	import { page } from '$app/state';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import ProductImage from '$lib/components/widgets/ProductImage.svelte';
	import { twMerge } from 'tailwind-merge';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import DailyFeedback from '$lib/components/widgets/DailyFeedback.svelte';
	import {
		attributeValueLabel,
		choiceLabel,
		choiceTitle,
		estimateDetails as estimatedWith,
		formatPrice as price,
		questionTitle as pairTitle
	} from '$lib/daily/labels';
	import { intlLocale, locale, m } from '$lib/i18n';

	const date = $derived(page.params.date ?? '');
	const dateFormatter = new Intl.DateTimeFormat(intlLocale, {
		day: 'numeric',
		month: 'numeric',
		year: 'numeric'
	});

	let index = $state<ArchiveIndex | null>(null);
	let archive = $state<ArchiveGame | null>(null);
	let loadError = $state<string | null>(null);
	let runs: ArchiveRuns = $state(loadArchiveRuns());
	let scores: ArchivedScores = $state(loadArchivedScores());
	let showAnswers = $state(false);
	let requestId = 0;

	const productMap = $derived(
		new Map<string, ArchiveProduct>(
			(archive?.products ?? []).map((product) => [product[AllColumns.Number], product])
		)
	);
	const run = $derived(date ? (runs[date] ?? null) : null);
	// Any recorded score (live or archive) means the day is finished: show the answers.
	const result = $derived(
		(date ? scores[date] : undefined) ??
			(run?.completed ? { score: run.score, correct: run.correct } : undefined)
	);
	const completed = $derived(result !== undefined);
	const questionIndex = $derived(run?.currentIndex ?? 0);
	const question = $derived(archive?.game.questions[questionIndex]);
	const runningTotal = $derived(run?.points.reduce((total, value) => total + value, 0) ?? 0);
	const answeredCorrectly = $derived(
		run?.answered === true && run.correctAnswers[run.currentIndex] === true
	);
	const lastQuestion = $derived(
		archive ? questionIndex === archive.game.questions.length - 1 : false
	);
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
			if (!/^\d{4}-\d{2}-\d{2}$/.test(forDate)) throw new Error(m.archive_day_not_archived());
			const response = await fetch(asset(`/daily/archive/${forDate}.json`));
			if (response.status === 404) throw new Error(m.archive_day_not_archived());
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			let parsed: ArchiveGame;
			try {
				parsed = await response.json();
			} catch {
				throw new Error(m.archive_day_not_archived());
			}
			if (!parsed || parsed.date !== forDate || !Array.isArray(parsed.game?.questions))
				throw new Error(m.archive_day_invalid());
			if (id !== requestId) return;
			archive = parsed;
		} catch (error) {
			if (id !== requestId) return;
			loadError = error instanceof Error ? error.message : m.archive_day_load_failed();
		}
	}

	async function loadIndex() {
		try {
			const response = await fetch(asset(`/daily/archive/index.json`));
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
		if (locale === 'fi') return `${day}.${month}.`;
		return new Date(year, month - 1, day, 12).toLocaleDateString(intlLocale, {
			day: 'numeric',
			month: 'short'
		});
	}

	function productName(id: string) {
		return localizedName(productMap.get(id)) ?? m.daily_unknown_product();
	}

	function correctAnswerLabel(currentQuestion: Question) {
		if (currentQuestion.type === 'price') return price(currentQuestion.correctPrice);
		if (currentQuestion.type === 'cheaper')
			return m.archive_answer_cheaper({ name: productName(currentQuestion.correctProductId) });
		if (currentQuestion.type === 'efficiency')
			return m.archive_answer_efficiency({ name: productName(currentQuestion.correctProductId) });
		if (currentQuestion.type === 'attribute')
			return `${productName(currentQuestion.correctProductId)}, ${attributeValueLabel(
				currentQuestion.metric,
				currentQuestion.values[currentQuestion.correctProductId]
			)}`;
		if (currentQuestion.type === 'choice')
			return choiceLabel(currentQuestion.field, currentQuestion.correctValue);
		return price(currentQuestion.correctPrice);
	}

	function updateRun(patch: Partial<ArchiveRunState>) {
		if (!date) return;
		const base: ArchiveRunState = runs[date] ?? {
			date,
			currentIndex: 0,
			points: [],
			correctAnswers: [],
			answers: [],
			selectedAnswer: null,
			answered: false,
			answerPoints: 0
		};
		runs = { ...runs, [date]: { ...base, ...patch } };
		saveArchiveRuns(runs);
	}

	function answer(value: string | number) {
		if (!question || run?.answered || completed) return;
		if (!run?.points.length) sendAnalyticsEvent('archive_game', { state: 'started', date });
		const points = questionPoints(question, value);
		const correct =
			question.type === 'estimate' ? Number(value) === question.correctPrice : points === 100;
		updateRun({
			selectedAnswer: value,
			answered: true,
			answerPoints: points,
			points: [...(run?.points ?? []), points],
			correctAnswers: [...(run?.correctAnswers ?? []), correct],
			answers: [...(run?.answers ?? []), value]
		});
		tick().then(() => document.getElementById('archive-continue')?.focus());
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
			recordArchivedScore(date, score, correct);
			scores = loadArchivedScores();
			sendAnalyticsEvent('archive_game', {
				state: 'completed',
				date,
				score,
				questions_right: correct
			});
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
				? m.archive_day_seo_description({ date: formatDate(date) })
				: m.archive_seo_title(),
			keywords: 'alkometriikka, daily, arkisto, vastaukset, tietovisa',
			og: {
				description: date ? `Alkometriikka Daily ${formatDate(date)}.` : m.archive_seo_title(),
				title: date ? `${m.daily_archive()} · ${date}` : m.daily_archive(),
				url: window.location.href,
				type: 'website'
			},
			twitter: { description: m.archive_seo_title(), title: m.daily_archive() }
		})
	);
</script>

<svelte:head>
	<title>{generateTitle(date ? `${m.daily_archive()} · ${date}` : m.daily_archive())}</title>
</svelte:head>

<main class="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-8 lg:gap-8 lg:p-10">
	<header class="flex flex-col gap-2 border-b border-primary pb-5">
		<div class="flex items-center justify-between gap-4">
			<a href={resolve('/daily/arkisto/')} class={twMerge(components.button(), 'px-3 py-2')}
				><span class="flex items-center gap-2"><Icon name="calendar" />{m.archive_calendar()}</span
				></a
			>
			{#if archive}
				<div class="flex items-center gap-2">
					{#if previousDate}
						<a
							href={resolve(`/daily/arkisto/${previousDate}/`)}
							class={twMerge(components.button(), 'px-3 py-2')}
							aria-label={m.archive_previous_day()}
							><Icon name="chevron_left" />{shortDate(previousDate)}</a
						>
					{/if}
					{#if nextDate}
						<a
							href={resolve(`/daily/arkisto/${nextDate}/`)}
							class={twMerge(components.button(), 'px-3 py-2')}
							aria-label={m.archive_next_day()}
							>{shortDate(nextDate)}<Icon name="chevron_right" /></a
						>
					{/if}
					<DailyFeedback
						{date}
						runMode="archive"
						questionIndex={run?.currentIndex ?? questionIndex}
						game={archive.game}
					/>
				</div>
			{/if}
		</div>
		<div>
			<p class="text-sm font-bold tracking-widest text-brand-2 uppercase">Alkometriikka Daily</p>
			<div class="flex items-center gap-2">
				<h1 class="text-3xl font-bold md:text-4xl">
					{date ? formatDate(date) : m.daily_archive()}
				</h1>
			</div>
		</div>
	</header>

	{#if loadError && !archive}
		<section
			class="flex flex-col items-center gap-4 rounded border border-primary bg-secondary p-8 text-center"
		>
			<p class="text-lg font-bold">{loadError}</p>
			<a
				href={resolve('/daily/arkisto/')}
				class={twMerge(components.button({ type: 'negative', size: 'md' }), 'px-4 py-2')}
				>{m.archive_back_to_calendar()}</a
			>
		</section>
	{:else if !archive}
		<section class="rounded border border-primary bg-secondary p-5 text-center">
			<p>{m.archive_day_loading()}</p>
		</section>
	{:else if completed}
		<section class="flex flex-col gap-5">
			<div class="flex items-center justify-between">
				<h2 class="text-xl font-bold">{m.calculator_results()}</h2>
				<a href={resolve('/daily/arkisto/')} class={twMerge(components.button(), 'px-3 py-2')}
					>{m.archive_calendar()}</a
				>
			</div>
			<section
				class="flex flex-col gap-5 rounded border border-primary bg-secondary p-5 text-center md:p-8"
			>
				<p class="text-lg font-bold">
					{m.archive_result({
						correct: result?.correct ?? 0,
						total: archive.game.questions.length
					})} · {m.daily_points({ count: result?.score ?? 0 })}
				</p>
				<p class="text-secondary">{m.archive_day_finished()}</p>
				<button
					class={twMerge(components.button(), 'mx-auto px-3 py-2')}
					onclick={() => (showAnswers = !showAnswers)}
				>
					{showAnswers ? m.archive_hide_answers() : m.archive_show_answers()}
				</button>
			</section>
			{#if showAnswers}
				{#each archive.game.questions as currentQuestion, questionIndex (questionIndex)}
					{@const given = run?.answers?.[questionIndex]}
					{@const wasCorrect = run?.correctAnswers?.[questionIndex]}
					<div class="rounded border border-primary bg-primary p-5 md:p-8">
						<div class="flex items-center justify-between text-sm font-bold">
							<span
								>{m.daily_question_progress({
									current: questionIndex + 1,
									total: archive.game.questions.length
								})}</span
							>
							{#if wasCorrect === true}
								<span class="flex items-center gap-1 text-green-700">
									<Icon name="check_circle" />{m.archive_correct()}
								</span>
							{:else if wasCorrect === false}
								<span class="flex items-center gap-1 text-red-700">
									<Icon name="block" />{m.archive_wrong()}
								</span>
							{:else}
								<span class="text-secondary">{m.archive_correct_answer()}</span>
							{/if}
						</div>
						<div class="mt-4">
							{#if currentQuestion.type === 'price'}
								<div class="flex items-center gap-4">
									<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
										<ProductImage
											number={currentQuestion.productId}
											name={localizedName(productMap.get(currentQuestion.productId)) ??
												m.stats_product()}
											transform="medium"
										/>
									</div>
									<div class="min-w-0">
										<p class="text-lg font-bold">{productName(currentQuestion.productId)}</p>
										<h3 class="mt-2 text-xl font-bold">{m.daily_question_price()}</h3>
									</div>
								</div>
								<div class="mt-6 grid grid-cols-2 gap-3">
									{#each currentQuestion.options as option (option)}
										{@const correct = Number(option) === currentQuestion.correctPrice}
										{@const picked = given !== undefined && Number(given) === Number(option)}
										<div
											class={twMerge(
												components.button(),
												'min-h-12 w-full justify-center text-lg',
												correct
													? 'border-green-600 bg-green-100 text-green-900'
													: picked
														? 'border-red-600 bg-red-100 text-red-900'
														: 'opacity-70'
											)}
										>
											{price(option)}
											{#if correct}<Icon name="check_circle" />{:else if picked}<Icon
													name="block"
												/>{/if}
										</div>
									{/each}
								</div>
							{:else if currentQuestion.type === 'cheaper' || currentQuestion.type === 'efficiency' || currentQuestion.type === 'attribute'}
								<h3 class="text-xl font-bold">{pairTitle(currentQuestion)}</h3>
								<div class="mt-6 grid gap-3 sm:grid-cols-2">
									{#each currentQuestion.productIds as id (id)}
										{@const correct = id === currentQuestion.correctProductId}
										{@const picked = given === id}
										<div
											class={twMerge(
												components.button(),
												'min-h-40 w-full justify-start p-3 text-left',
												correct
													? 'border-green-600 bg-green-100 text-green-900'
													: picked
														? 'border-red-600 bg-red-100 text-red-900'
														: 'opacity-70'
											)}
										>
											<div class="h-32 w-24 shrink-0 rounded bg-white p-1">
												<ProductImage number={id} name={productName(id)} transform="medium" />
											</div>
											<span class="min-w-0">{productName(id)}</span>
											{#if correct}<Icon name="check_circle" />{:else if picked}<Icon
													name="block"
												/>{/if}
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
											name={localizedName(productMap.get(currentQuestion.productId)) ??
												m.stats_product()}
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
										{@const picked = given === option}
										<div
											class={twMerge(
												components.button(),
												'min-h-12 w-full justify-start text-left',
												correct
													? 'border-green-600 bg-green-100 text-green-900'
													: picked
														? 'border-red-600 bg-red-100 text-red-900'
														: 'opacity-70'
											)}
										>
											{choiceLabel(currentQuestion.field, option)}
											{#if correct}<Icon name="check_circle" />{:else if picked}<Icon
													name="block"
												/>{/if}
										</div>
									{/each}
								</div>
							{:else if currentQuestion.type === 'estimate'}
								<div class="flex gap-4">
									<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
										<ProductImage
											number={currentQuestion.productId}
											name={localizedName(productMap.get(currentQuestion.productId)) ??
												m.stats_product()}
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
								<h3 class="mt-5 text-xl font-bold">{m.daily_question_estimate()}</h3>
								{#if given !== undefined}
									<div
										class={twMerge(
											'mt-6 rounded border p-3 text-lg font-bold',
											wasCorrect
												? 'border-green-600 bg-green-100 text-green-900'
												: 'border-red-600 bg-red-100 text-red-900'
										)}
									>
										<span class="flex items-center gap-2">
											<Icon name={wasCorrect ? 'check_circle' : 'block'} />{m.archive_your_estimate(
												{
													price: price(Number(given))
												}
											)}
										</span>
									</div>
								{/if}
								<div
									class="mt-3 rounded border border-green-600 bg-green-100 p-3 text-lg font-bold text-green-900"
								>
									<span class="flex items-center gap-2">
										<Icon name="check_circle" />{m.archive_correct_price({
											price: price(currentQuestion.correctPrice)
										})}
									</span>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		</section>
	{:else if question}
		<section class="flex flex-col gap-5">
			<div class="flex items-center justify-between text-sm font-bold">
				<span
					>{m.daily_question_progress({
						current: questionIndex + 1,
						total: archive.game.questions.length
					})}</span
				>
				<span class="text-secondary">{m.daily_points({ count: runningTotal })}</span>
			</div>
			<div class="h-2 overflow-hidden rounded bg-secondary">
				<div class="h-full bg-brand-2 transition-all" style={`width: ${progressPercent}%`}></div>
			</div>

			<div class="rounded border border-primary bg-primary p-5 md:p-8 lg:p-10">
				{#if question.type === 'price'}
					<div class="flex items-center gap-4">
						<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
							<ProductImage
								number={question.productId}
								name={localizedName(productMap.get(question.productId)) ?? m.stats_product()}
								transform="medium"
							/>
						</div>
						<div class="min-w-0">
							<p class="text-lg font-bold">{productName(question.productId)}</p>
							<h2 class="mt-2 text-2xl font-bold">{m.daily_question_price()}</h2>
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
								name={localizedName(productMap.get(question.productId)) ?? m.stats_product()}
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
								{choiceLabel(question.field, option)}
							</button>
						{/each}
					</div>
				{:else if question.type === 'estimate'}
					<div class="flex gap-4">
						<div class="h-40 w-28 shrink-0 rounded bg-white p-2">
							<ProductImage
								number={question.productId}
								name={localizedName(productMap.get(question.productId)) ?? m.stats_product()}
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
					<h2 class="mt-5 text-2xl font-bold">{m.daily_question_estimate()}</h2>
					<form class="mt-6 flex flex-col gap-3 sm:flex-row" onsubmit={submitEstimate}>
						<label
							class="flex flex-1 items-center gap-2 rounded border border-primary px-3 py-2 focus-within:outline-1 focus-within:outline-offset-2 focus-within:outline-brand-1"
						>
							<span>€</span>
							<input
								name="estimate"
								class="w-full border-0 bg-transparent text-lg focus:ring-0 focus-visible:outline-none"
								type="number"
								min="0"
								step="0.01"
								required
								disabled={run?.answered}
								aria-label={m.daily_estimate_label()}
							/>
						</label>
						<button
							class={twMerge(
								components.button({ type: 'negative', size: 'md' }),
								'justify-center px-5 py-2'
							)}
							disabled={run?.answered}
						>
							{m.daily_answer()}
						</button>
					</form>
				{/if}

				{#if run?.answered}
					<div class="mt-6 border-t border-primary pt-5" aria-live="polite">
						{#if answeredCorrectly}
							<p class="flex items-center gap-2 text-lg font-bold text-green-700">
								<Icon name="check_circle" />
								{m.daily_correct()}
								<span class="text-secondary">+{m.daily_points({ count: run.answerPoints })}</span>
							</p>
						{:else if question.type === 'estimate' && run.answerPoints > 0}
							<p class="flex items-center gap-2 text-lg font-bold text-green-700">
								<Icon name="check_circle" />
								{m.daily_good_estimate()}
								<span class="text-secondary">+{m.daily_points({ count: run.answerPoints })}</span>
							</p>
						{:else}
							<p class="flex items-center gap-2 text-lg font-bold text-red-700">
								<Icon name="block" />
								{m.archive_wrong()}
								<span class="text-secondary">· {m.daily_points({ count: run.answerPoints })}</span>
							</p>
						{/if}
						<p class="mt-2 text-secondary">
							{m.daily_correct_answer({ answer: correctAnswerLabel(question) })}
						</p>
						<button
							id="archive-continue"
							class={twMerge(components.button({ type: 'negative', size: 'md' }), 'mt-4 px-4 py-2')}
							onclick={continueGame}
						>
							{lastQuestion ? m.archive_show_results() : m.archive_next_question()}
						</button>
					</div>
				{/if}
			</div>
		</section>
	{/if}
</main>
