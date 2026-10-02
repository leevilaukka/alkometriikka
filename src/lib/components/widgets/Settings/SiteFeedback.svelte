<script lang="ts">
	import FeedbackDialog from '$lib/components/widgets/FeedbackDialog.svelte';
	import { sendAnalyticsEvent } from '$lib/utils/helpers';
	import { version } from '$app/environment';
	import { page } from '$app/state';

	const categories = [
		{ key: 'wrong_product_info', label: 'Tuotetiedot ovat väärät tai puuttuvat' },
		{ key: 'wrong_image', label: 'Kuva puuttuu tai on väärä' },
		{ key: 'search_broken', label: 'Haku ei toimi odotetusti' },
		{ key: 'filters_broken', label: 'Suodattimet eivät toimi odotetusti' },
		{ key: 'page_crash', label: 'Sivu ei lataudu tai kaatuu' },
		{ key: 'ui_bug', label: 'Käyttöliittymävika tai ulkoasu rikki' },
		{ key: 'other', label: 'Jokin muu ongelma' }
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
	title="Ilmoita ongelmasta"
	description="Valitse alta, mikä meni pieleen — emme kerää vapaata tekstiä, vain valitut kohdat ja tämänhetkisen sivun ja version, jotta voimme jäljittää vian."
	thankYou="Kiitos ilmoituksesta! Käytämme sitä Alkometriikan kehittämiseen."
	{categories}
	onSubmit={handleSubmit}
/>
