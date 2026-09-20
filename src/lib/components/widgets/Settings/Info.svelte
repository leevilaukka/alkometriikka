<script lang="ts">
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { version } from '$app/environment';
	import { timeConfig } from '$lib/utils/constants';
	const { alko, dialogElement, githubRepoBase, githubFileBase, gitCommitHash } = $props();
</script>

<div class="prose dark:prose-invert">
				<h2 class="text-lg font-bold">Tietoa</h2>
				<p>
					Alkometriikka on
					<a href={githubRepoBase} target="_blank">
						avoimen lähdekoodin
					</a> web-sovellus, joka listaa Alkon tuotevalikoiman ja antaa käyttäjille hieman laskennallista
					tietoa tuotteista.
				</p>
				<p>
					Voit lähettää kehitysehdotuksia ja bugiraportteja GitHubin kautta. <br />
					<a
						href={`${githubRepoBase}/issues/new?template=feature_request.md`}
						>Lähetä kehitysehdotus
					</a>
					|
					<a href={`${githubRepoBase}/issues/new?template=bug_report.md`}
						>Lähetä bugiraportti
					</a>
				</p>
				<p>
					Muut yhteydenotot voi lähettää sähköpostitse osoitteeseen
					<a href="mailto:contact@alkometriikka.fi">contact@alkometriikka.fi</a>.
				</p>
				<p>
					Voit tilata hintamuutos- ja uutuustuotetiedot <a href="https://alkometriikka.fi/rss.xml" target="_blank">RSS-</a> tai <a href="https://alkometriikka.fi/feed.json" target="_blank">JSON-syötteen</a> kautta.
				</p>
				<details>
					<summary class="cursor-pointer">Tietolähteet</summary>
					<p>
						Tuotevalikoima ladataan Alkon rajapinnoista. Tiedostoa päivitetään noin
						kuuden tunnin välein. Voit ladata Alkometriikan käyttämän tiedoston <a
							href={`${githubFileBase}/data.json`}
							download
							>tästä
						</a>.
					</p>
					<p>
						Myymälä- ja tuotesaatavuustiedot ladataan samoista rajapinnoista ja päivittyvät samaan aikaan kuin tuotevalikoima. Tämän vuoksi saatavuustiedot eivät välttämättä ole täysin ajantasaisia. Voit ladata nykyiset myymälä- ja saatavuustiedot <a
							href={`${githubFileBase}/availability.json`}
							download
							>tästä
						</a>.
					</p>
					<p>
						Valikoiman "poistuneet tuotteet" perustuvat Alkometriikan aiemmin keräämiin tietoihin. Tiedot eivät siis sisällä kautta aikojen kaikkia poistuneita tuotteita, vaan vain ne, jotka on kerätty ennen tuotteen poistumista valikoimasta. Tämän vuoksi tietoa ei voi pitää täysin luotettavana.
					</p>
				</details>
			</div>
			<div class="flex flex-row items-center gap-2">
				<a
					href={githubRepoBase}
					target="_blank"
					class={twMerge(components.button())}
				>
					<Icon name="github" class="inline-block" />
					<span>GitHub</span>
				</a>
				<a
					href="mailto:contact@alkometriikka.fi"
					target="_blank"
					class={twMerge(components.button())}
				>
					<Icon name="mail_send" class="inline-block" />
					<span>Sähköposti</span>
				</a>
				<div class="flex flex-1">
					<a
						href="https://alkometriikka.fi/rss.xml"
						target="_blank"
						class={twMerge(components.button(), "rounded-e-none")}
					>
						<Icon name="rss" class="inline-block" />
						<span>RSS</span>
					</a>
					<a
						href="https://alkometriikka.fi/feed.json"
						target="_blank"
						class={twMerge(components.button(), "rounded-s-none border-s-0")}
					>
						<Icon name="bracket_curly" class="inline-block" />
						<span>JSON-syöte</span>
					</a>
				</div>
			</div>
			<p class="text-sm text-secondary">
				Versio: <a href={`${githubRepoBase}/commit/${version}`} target="_blank">
					{gitCommitHash}
				</a>
				{#if alko.dataset.metadata.LastUpdated && alko.dataset.metadata.LastSynced}
					<br />
				{@const lastSynced = `${new Date(alko.dataset.metadata.LastSynced).toLocaleDateString('fi-FI')} klo ${new Date(alko.dataset.metadata.LastSynced).toLocaleTimeString('fi-FI', timeConfig)}`}
				{@const lastUpdated = `${new Date(alko.dataset.metadata.LastUpdated).toLocaleDateString('fi-FI')} klo ${new Date(alko.dataset.metadata.LastUpdated).toLocaleTimeString('fi-FI', timeConfig)}`}
				{@const {sync, update} = alko.dataset.metadata.ci}
					Viimeisin synkronointi: 
					{#if sync.workflowRun}
						<a href={sync.workflowRun} target="_blank">{lastSynced}</a>
					{:else}
						{lastSynced}
					{/if}
					| Viimeisin muutos: 
					{#if update.workflowRun}
						<a href={update.workflowRun} target="_blank">{lastUpdated}</a>
					{:else}
						{lastUpdated}
					{/if}
					{#if alko.availability && alko.availability.lastUpdated && alko.availability.lastUpdated !== alko.dataset.metadata.LastUpdated}
						{@const availabilitySynced = `${new Date(alko.availability.lastUpdated).toLocaleDateString('fi-FI')} klo ${new Date(alko.availability.lastUpdated).toLocaleTimeString('fi-FI', timeConfig)}`}
						<br/>
						Saatavuustiedot viimeksi synkronoitu: {availabilitySynced}
					{/if}
				{/if}
				
			</p>
			<button class={twMerge(components.button(), 'w-full')} onclick={() => dialogElement.close()}
				>Sulje</button
			>