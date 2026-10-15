<script lang="ts">
	import FeedbackDialog from '$lib/components/widgets/FeedbackDialog.svelte';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { sha256Hex } from '$lib/daily/manifest';
	import type { GameTypes } from '$lib/types';
	import type { GeneratedGame } from '$lib/daily/questions';
	import { m } from '$lib/i18n';

	let {
		date,
		runMode,
		dayNumber,
		questionIndex,
		game
	}: {
		date: string;
		runMode: GameTypes;
		dayNumber?: number;
		questionIndex: number;
		game: GeneratedGame | null;
	} = $props();

	const categories = [
		{ key: 'wrong_answer', label: m.daily_feedback_wrong_answer() },
		{ key: 'wrong_price', label: m.daily_feedback_wrong_price() },
		{ key: 'wrong_image', label: m.site_feedback_wrong_image() },
		{ key: 'unclear_question', label: m.daily_feedback_unclear_question() },
		{ key: 'ui_bug', label: m.daily_feedback_ui_bug() },
		{ key: 'other', label: m.site_feedback_other() }
	] as const;

	async function handleSubmit(selected: Record<string, boolean>) {
		const gameHash = game ? await sha256Hex(JSON.stringify(game)) : '';
		sendAnalyticsEvent('daily_feedback', {
			date,
			run_mode: runMode,
			day_number: dayNumber,
			question_index: questionIndex,
			game_hash: gameHash,
			wrong_answer: selected.wrong_answer,
			wrong_price: selected.wrong_price,
			wrong_image: selected.wrong_image,
			unclear_question: selected.unclear_question,
			ui_bug: selected.ui_bug,
			other: selected.other
		});
	}
</script>

<FeedbackDialog
	triggerClass="px-3 py-2"
	title={m.site_feedback_title()}
	description={m.daily_feedback_description()}
	thankYou={m.daily_feedback_thanks()}
	{categories}
	onSubmit={handleSubmit}
/>
