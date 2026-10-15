<script lang="ts">
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { version } from '$app/environment';
	import SiteFeedback from './SiteFeedback.svelte';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { formatDateTime } from '$lib/utils/format/format';
	import { feedPath } from '$lib/utils/app/feeds';
	import { m } from '$lib/i18n';
	const { alko, dialogElement, githubRepoBase, githubFileBase, gitCommitHash } = $props();

	const rssUrl = `https://alkometriikka.fi${feedPath('rss.xml')}`;
	const jsonFeedUrl = `https://alkometriikka.fi${feedPath('feed.json')}`;
</script>

<div class="prose dark:prose-invert">
	<h2 class="text-lg font-bold">{m.settings_info_title()}</h2>
	<p>
		{m.info_about_before()}
		<a href={githubRepoBase} target="_blank">{m.info_about_link()}</a>
		{m.info_about_after()}
	</p>
	<p>
		{m.info_github_feedback()} <br />
		<a href={`${githubRepoBase}/issues/new?template=feature_request.md`}
			>{m.info_feature_request()}</a
		>
		|
		<a href={`${githubRepoBase}/issues/new?template=bug_report.md`}>{m.info_bug_report()}</a>
	</p>
	<p>{m.info_in_app_feedback()}</p>
	<p>
		{m.info_email()}
		<a href="mailto:contact@alkometriikka.fi">contact@alkometriikka.fi</a>.
	</p>
	<p>
		{m.info_feeds_before()}
		<a
			href={rssUrl}
			target="_blank"
			onclick={() => sendAnalyticsEvent('click_feed', { feed: 'site', location: 'info_text' })}
			>{m.info_feeds_rss()}</a
		>
		{m.info_feeds_or()}
		<a
			href={jsonFeedUrl}
			target="_blank"
			onclick={() => sendAnalyticsEvent('click_feed', { feed: 'json', location: 'info_text' })}
			>{m.info_feeds_json()}</a
		>{m.info_feeds_after()}
	</p>
	<details>
		<summary class="cursor-pointer">{m.info_sources_title()}</summary>
		<p>
			{m.info_sources_catalog()}
			<a href={`${githubFileBase}/data.json`} download>{m.info_sources_download_link()}</a>.
		</p>
		<p>
			{m.info_sources_availability()}
			<a href={`${githubFileBase}/availability.json`} download>{m.info_sources_download_link()}</a>.
		</p>
		<p>{m.info_sources_removed()}</p>
	</details>
</div>
<div class="flex flex-row flex-wrap items-center gap-2">
	<a href={githubRepoBase} target="_blank" class={twMerge(components.button())}>
		<Icon name="github" class="inline-block" />
		<span>GitHub</span>
	</a>
	<a href="mailto:contact@alkometriikka.fi" target="_blank" class={twMerge(components.button())}>
		<Icon name="mail_send" class="inline-block" />
		<span>{m.info_email_button()}</span>
	</a>
	<SiteFeedback />
	<div class="flex">
		<a
			href={rssUrl}
			target="_blank"
			onclick={() => sendAnalyticsEvent('click_feed', { feed: 'site', location: 'info_button' })}
			class={twMerge(components.button(), 'rounded-e-none')}
		>
			<Icon name="rss" class="inline-block" />
			<span>RSS</span>
		</a>
		<a
			href={jsonFeedUrl}
			target="_blank"
			onclick={() => sendAnalyticsEvent('click_feed', { feed: 'json', location: 'info_button' })}
			class={twMerge(components.button(), 'rounded-s-none border-s-0')}
		>
			<Icon name="bracket_curly" class="inline-block" />
			<span>{m.info_json_feed_button()}</span>
		</a>
	</div>
</div>
<p class="text-sm text-secondary">
	{m.info_version()}
	<a href={`${githubRepoBase}/commit/${version}`} target="_blank">
		{gitCommitHash}
	</a>
	{#if alko.dataset.metadata.LastUpdated && alko.dataset.metadata.LastSynced}
		<br />
		{@const lastSynced = formatDateTime(alko.dataset.metadata.LastSynced)}
		{@const lastUpdated = formatDateTime(alko.dataset.metadata.LastUpdated)}
		{@const { sync, update } = alko.dataset.metadata.ci}
		{m.info_last_synced()}
		{#if sync.workflowRun}
			<a href={sync.workflowRun} target="_blank">{lastSynced}</a>
		{:else}
			{lastSynced}
		{/if}
		| {m.info_last_updated()}
		{#if update.workflowRun}
			<a href={update.workflowRun} target="_blank">{lastUpdated}</a>
		{:else}
			{lastUpdated}
		{/if}
		{#if alko.availability && alko.availability.lastUpdated && alko.availability.lastUpdated !== alko.dataset.metadata.LastUpdated}
			<br />
			{m.info_availability_synced({ date: formatDateTime(alko.availability.lastUpdated) })}
		{/if}
	{/if}
</p>
<button class={twMerge(components.button(), 'w-full')} onclick={() => dialogElement.close()}
	>{m.common_close()}</button
>
