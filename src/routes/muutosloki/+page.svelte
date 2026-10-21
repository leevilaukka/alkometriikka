<script lang="ts">
	import changelog from 'virtual:changelog';
	import { generateTitle, setSEO } from '$lib/utils/app/meta';
	import { staticPage } from '$lib/utils/app/seo';

	const { description, keywords } = staticPage('/muutosloki/');
	setSEO({
		og: { title: generateTitle('Muutosloki'), description, url: window.location.href },
		keywords,
		description
	});
</script>

<svelte:head>
	<title>{generateTitle('Muutosloki')}</title>
</svelte:head>

<main class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
	<header>
		<h1 class="text-2xl font-bold md:text-3xl">Muutosloki</h1>
		<p class="mt-2 text-secondary">Alkometriikan uudet ominaisuudet ja korjaukset kuukausittain.</p>
	</header>

	{#if changelog}
		<aside class="rounded border border-primary bg-secondary p-4 text-sm">
			<p class="font-bold">Miksi osa merkinnöistä on englanniksi?</p>
			<p class="mt-1 text-secondary">
				Muutosloki kootaan automaattisesti suoraan Alkometriikan kehityshistoriasta eli versionhallinnan commit-viesteistä, jotka kirjoitetaan englanniksi. Näytämme ne sellaisinaan, jotta loki päivittyy jokaisen muutoksen mukana ilman erillistä käännöstyötä. Osaan merkinnöistä on kirjoitettu myös suomenkielinen kuvaus.
			</p>
		</aside>

		<!-- Built from our own commit messages by git-cliff, see cliff.toml -->
		<article class="changelog prose max-w-none dark:prose-invert prose-h2:mt-10 prose-h2:border-b prose-h2:border-primary prose-h2:pb-2 prose-h3:text-base prose-h3:text-secondary prose-li:my-0.5">
			{@html changelog}
		</article>
	{:else}
		<p class="text-secondary">Muutoslokia ei ole saatavilla.</p>
	{/if}
</main>

<style>
	/* Entries with a commit body make the markdown list loose, wrapping every item in a <p> */
	.changelog :global(li > p) {
		margin: 0;
	}

	.changelog :global(summary) {
		cursor: pointer;
	}

	.changelog :global(summary > p) {
		display: inline;
	}

	.changelog :global(a.commit) {
		margin-left: 0.25rem;
		color: var(--tw-prose-captions);
		font-family: var(--font-mono);
		font-size: 0.75em;
		font-weight: normal;
		text-decoration: none;
	}

	.changelog :global(a.commit:hover) {
		text-decoration: underline;
	}

	/* The English commit subject under a Finnish `log:` entry */
	.changelog :global(span.original) {
		display: block;
		color: var(--tw-prose-captions);
		font-size: 0.875em;
	}

	.changelog :global(details > :not(summary)) {
		margin: 0.5rem 0 0.75rem;
		padding-left: 0.75rem;
		border-left: 2px solid var(--tw-prose-hr);
		color: var(--tw-prose-captions);
		font-size: 0.875em;
	}
</style>
