<script lang="ts">
	import FeedbackDialog from '$lib/components/widgets/FeedbackDialog.svelte';
	import { sendAnalyticsEvent } from '$lib/utils/helpers';
	import { sha256Hex } from '$lib/daily/manifest';
	import type { GameTypes } from '$lib/types';
	import type { GeneratedGame } from '$lib/daily/questions';

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
		{ key: 'wrong_answer', label: 'Vastaus on merkitty väärin' },
		{ key: 'wrong_price', label: 'Hinta on väärä' },
		{ key: 'wrong_image', label: 'Kuva puuttuu tai on väärä' },
		{ key: 'unclear_question', label: 'Kysymys on epäselvä' },
		{ key: 'ui_bug', label: 'Käyttöliittymävika' },
		{ key: 'other', label: 'Jokin muu ongelma' }
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
	title="Ilmoita ongelmasta"
	description="Daily on vielä betassa. Valitse alta, mikä meni pieleen — emme kerää vapaata tekstiä, vain valitut kohdat ja tämän pelin tunnisteen, jotta voimme jäljittää vian."
	thankYou="Kiitos ilmoituksesta! Käytämme sitä Daily-betan kehittämiseen."
	{categories}
	onSubmit={handleSubmit}
/>
