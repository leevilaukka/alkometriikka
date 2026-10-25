<script lang="ts">
	import FeedbackDialog from '$lib/components/widgets/FeedbackDialog.svelte';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { version } from '$app/environment';
	import { page } from '$app/state';
	import { m } from '$lib/i18n';

	let { showTrigger = true }: { showTrigger?: boolean } = $props();
	let dialog = $state<ReturnType<typeof FeedbackDialog>>();

	export function open() {
		dialog?.open();
	}

	const categories = [
		{ key: 'wrong_product_info', label: m.site_feedback_wrong_product_info() },
		{ key: 'wrong_image', label: m.site_feedback_wrong_image() },
		{ key: 'search_broken', label: m.site_feedback_search_broken() },
		{ key: 'filters_broken', label: m.site_feedback_filters_broken() },
		{ key: 'page_crash', label: m.site_feedback_page_crash() },
		{ key: 'ui_bug', label: m.site_feedback_ui_bug() },
		{ key: 'other', label: m.site_feedback_other() }
	] as const;

	function handleSubmit(selected: Record<string, boolean>) {
		sendAnalyticsEvent('site_feedback', {
			path: page.url.pathname,
			version,
			wrong_product_info: selected.wrong_product_info,
			wrong_image: selected.wrong_image,
			search_broken: selected.search_broken,
			filters_broken: selected.filters_broken,
			page_crash: selected.page_crash,
			ui_bug: selected.ui_bug,
			other: selected.other
		});
	}
</script>

<FeedbackDialog
	bind:this={dialog}
	{showTrigger}
	title={m.site_feedback_title()}
	description={m.site_feedback_description()}
	thankYou={m.site_feedback_thanks()}
	{categories}
	onSubmit={handleSubmit}
/>
