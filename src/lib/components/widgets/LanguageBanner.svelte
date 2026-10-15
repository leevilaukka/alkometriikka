<script lang="ts">
	import { twMerge } from 'tailwind-merge';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { components } from '$lib/utils/ui/styles';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { locale, m, setLocale, suggestedLocale } from '$lib/i18n';
	import { dismissLanguageBanner, languageBannerDismissed } from '$lib/utils/app/language';

	/** Crawlers render the page with an English browser; they get the Finnish site as it is */
	const isBot = /bot|crawl|spider|slurp|lighthouse|headless/i.test(navigator.userAgent);

	// Offered on the Finnish site until the visitor answers it or picks a language in the settings.
	// Paraglide stores "fi" on the first visit by itself, so that can't tell whether anyone chose
	const suggested =
		!isBot && locale === 'fi' && !languageBannerDismissed() ? suggestedLocale() : undefined;
	let visible = $state(suggested !== undefined);

	function switchLanguage() {
		if (!suggested) return;
		sendAnalyticsEvent('change_language', { from: 'fi', to: suggested, location: 'banner' });
		dismissLanguageBanner();
		setLocale(suggested);
	}

	function keepFinnish() {
		visible = false;
		sendAnalyticsEvent('dismiss_language_banner', { suggested });
		dismissLanguageBanner();
	}
</script>

<!-- Same look as NoticeBanner. Written in the suggested language, since that's the one the visitor reads -->
{#if visible && suggested}
	<div
		role="status"
		lang={suggested}
		class="flex flex-wrap items-center gap-2 border-b border-primary bg-secondary px-4 py-2 text-sm"
	>
		<Icon name="info_circle" class="shrink-0" />
		<p class="flex-1">{m.language_banner_text({}, { locale: suggested })}</p>
		<div class="flex shrink-0 gap-2">
			<button class={twMerge(components.button({ type: 'negative' }))} onclick={switchLanguage}>
				{m.language_banner_switch({}, { locale: suggested })}
			</button>
			<button class={twMerge(components.button())} onclick={keepFinnish}>
				{m.language_banner_keep({}, { locale: suggested })}
			</button>
		</div>
	</div>
{/if}
