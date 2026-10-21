<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { appPath } from '$lib/utils/app/paths';
	import { formatHistoryDate } from '$lib/utils/catalog/priceHistory';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let query = $state('');
	let year = $state('all');
	let tab = $state<'products' | 'sources' | 'review'>('products');
	let currentPage = $state(1);
	const size = 40;
	const report = $derived(data.preview);
	const selectedSource = $derived(page.url.searchParams.get('source'));
	const activeTab = $derived(selectedSource ? 'sources' : tab);
	const search = $derived(query.trim().toLocaleLowerCase('fi-FI'));
	const products = $derived(
		(report?.products ?? []).filter(
			(product) =>
				(!search || `${product.id} ${product.name}`.toLocaleLowerCase('fi-FI').includes(search)) &&
				(year === 'all' || product.firstDate.startsWith(year))
		)
	);
	const sources = $derived(
		(report?.sources ?? []).filter((source) =>
			selectedSource
				? source.id === selectedSource
				: (year === 'all' || source.date.startsWith(year)) &&
					(!search ||
						`${source.id} ${source.date} ${source.url}`.toLocaleLowerCase('fi-FI').includes(search))
		)
	);
	const reviews = $derived(
		(report?.review ?? []).filter(
			(row) =>
				!search ||
				`${row.id} ${row.currentName} ${row.historicalName}`
					.toLocaleLowerCase('fi-FI')
					.includes(search)
		)
	);
	const count = $derived(
		activeTab === 'products'
			? products.length
			: activeTab === 'sources'
				? sources.length
				: reviews.length
	);
	const pages = $derived(Math.max(1, Math.ceil(count / size)));
	const start = $derived((Math.min(currentPage, pages) - 1) * size);
	const examples = $derived(
		['319027', '000132', '755027']
			.map((id) => report?.products.find((product) => product.id === id))
			.filter((product) => product !== undefined)
	);
	const number = (value: number) => value.toLocaleString('fi-FI');
	const money = (value: number | null) =>
		value == null ? '—' : value.toLocaleString('fi-FI', { style: 'currency', currency: 'EUR' });
	const reasons: Record<string, string> = {
		different_name: 'Nimi poikkeaa',
		different_volume: 'Pullokoko poikkeaa',
		missing_volume: 'Pullokoko puuttuu'
	};
	$effect(() => {
		void query;
		void year;
		void tab;
		currentPage = 1;
	});
</script>

<svelte:head>
	<title>Historialliset hinnat · Alkometriikka</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-10" data-testid="history-preview">
	{#if report}
		<div class="mb-8 flex flex-wrap items-start justify-between gap-5">
			<div class="max-w-3xl">
				<p
					class="mb-3 text-xs font-bold tracking-[0.2em] text-amber-600 uppercase dark:text-amber-400"
				>
					Arkistohinnastot
				</p>
				<h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
					Hintahistoria ulottuu kauemmas.
				</h1>
				<p class="mt-4 max-w-2xl text-base leading-relaxed text-secondary">
					Tutki talteen otettuja hintoja ajalta <strong class="text-primary"
						>{formatHistoryDate(report.firstDate)}–{formatHistoryDate(report.lastDate)}</strong
					>. Arkistohavainnot on yhdistetty tuotteisiin tuotenumeron, pullokoon ja nimen
					perusteella.
				</p>
			</div>
			<a
				class="rounded border border-primary bg-secondary px-4 py-2.5 text-sm font-semibold hover:bg-primary"
				href={appPath('/data.json')}
				download="alkometriikka-history-preview.json">Lataa hinnasto ↓</a
			>
		</div>

		<div class="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
			{#each [['Yhdistettyjä tuotteita', report.statistics.products], ['Hyväksyttyjä arkistohavaintoja', report.statistics.acceptedObservations], ['Kerättyjä hinnastopäiviä', report.rawSnapshotDates], ['Tiivistettyjä hintapisteitä', report.statistics.archivePoints]] as [label, value]}
				<div class="rounded-lg border border-primary bg-secondary p-4 sm:p-5">
					<p class="text-xs text-secondary sm:text-sm">{label}</p>
					<p class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
						{number(Number(value))}
					</p>
				</div>
			{/each}
		</div>

		<div class="mb-7 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
			<div class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
				<h2 class="font-semibold">Mitä kaaviossa näkyy?</h2>
				<p class="mt-2 text-sm leading-relaxed text-secondary">
					Punainen viiva näyttää hintahistorian. Katkoviiva yhdistää havainnot ajanjaksoilla, joilta
					puuttuu tietoja. Arkisto ei aina kerro tarkkaa hinnanmuutospäivää.
				</p>
				<p class="mt-3 text-sm text-secondary">
					Nykyhinnat ja aiemmin tallennetut kampanjatiedot ovat mukana sellaisinaan. <strong
						>{report.conflicts.length} hintaristiriita{report.conflicts.length === 1
							? ''
							: 'a'}</strong
					> on jätetty tarkistettavaksi.
				</p>
			</div>
			<div class="rounded-lg border border-primary bg-secondary p-5">
				<h2 class="font-semibold">Avaa esimerkkituote</h2>
				<div class="mt-3 flex flex-wrap gap-2">
					{#each examples as product}<a
							class="rounded-full border border-primary bg-primary px-3 py-2 text-sm hover:border-amber-600"
							href={appPath(`/tuotteet/${product.id}/`)}>{product.name} ↗</a
						>{/each}
				</div>
				<a
					class="mt-4 inline-block text-xs text-secondary underline"
					href={appPath('/history-preview.json')}
					download="history-preview-report.json">Lataa lähteet ja tarkistusraportti</a
				>
			</div>
		</div>

		<section class="overflow-hidden rounded-lg border border-primary bg-secondary">
			<div
				class="flex flex-wrap gap-1 border-b border-primary px-3 pt-2"
				role="tablist"
				aria-label="Työaineiston näkymä"
			>
				{#each [{ key: 'products', label: 'Tuotteet', count: report.products.length }, { key: 'sources', label: 'Lähteet', count: report.sources.length }, { key: 'review', label: 'Tarkistettavat osumat', count: report.review.length + report.conflicts.length }] as option}
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === option.key}
						class={`border-b-2 px-3 py-3 text-sm font-medium ${activeTab === option.key ? 'text-primary border-amber-600' : 'hover:text-primary border-transparent text-secondary'}`}
						onclick={() => {
							tab = option.key as typeof tab;
							if (selectedSource) void goto(appPath('/historia/'), { noScroll: true });
						}}
						>{option.label}
						<span class="ml-1 text-xs text-secondary">{number(option.count)}</span></button
					>
				{/each}
			</div>
			<div class="flex flex-wrap items-end gap-3 border-b border-primary p-4">
				<label class="min-w-40 flex-1 text-xs font-medium text-secondary"
					>{activeTab === 'sources'
						? 'Hae lähdettä tai päivämäärää'
						: 'Hae nimeä tai tuotenumeroa'}<input
						class="text-primary mt-1.5 w-full rounded border border-primary bg-primary px-3 py-2.5 text-sm outline-none focus:border-amber-600"
						placeholder={activeTab === 'sources'
							? 'Esim. 2025-09 tai GitHub'
							: 'Esim. Gambina tai 319027'}
						bind:value={query}
					/></label
				>
				{#if activeTab !== 'review' && !selectedSource}<label
						class="text-xs font-medium text-secondary"
						>{activeTab === 'products' ? 'Vanhimman havainnon vuosi' : 'Hinnaston vuosi'}<select
							class="text-primary mt-1.5 block rounded border border-primary bg-primary py-2.5 pr-9 pl-3 text-sm"
							bind:value={year}
							><option value="all">Kaikki vuodet</option
							>{#each Object.keys(report.collectedDatesByYear).reverse() as value}<option {value}
									>{value}</option
								>{/each}</select
						></label
					>{/if}
				{#if selectedSource}<a class="pb-2 text-sm underline" href={appPath('/historia/')}
						>Näytä kaikki lähteet</a
					>{/if}
			</div>
			<div class="overflow-x-auto">
				{#if activeTab === 'products'}
					<table class="w-full min-w-[650px] text-left text-sm">
						<thead class="bg-primary text-xs text-secondary"
							><tr
								><th class="px-4 py-3">Tuote</th><th class="px-4 py-3">Vanhin havainto</th><th
									class="px-4 py-3">Arkiston viimeinen havainto</th
								><th class="px-4 py-3 text-right">Hintapisteitä</th><th class="px-4 py-3 text-right"
									>Nykyhinta</th
								></tr
							></thead
						>
						<tbody
							>{#each products.slice(start, start + size) as product}<tr
									class="border-t border-primary hover:bg-primary"
									><td class="px-4 py-3"
										><a
											class="font-medium hover:underline"
											href={appPath(`/tuotteet/${product.id}/`)}>{product.name}</a
										>
										<p class="mt-1 text-xs text-secondary">
											{product.id} · {String(product.volume).replace('.', ',')} l{product.removed
												? ' · Poistunut valikoimasta'
												: ''}
										</p></td
									><td class="px-4 py-3 whitespace-nowrap"
										>{formatHistoryDate(product.firstDate)}</td
									><td class="px-4 py-3">{formatHistoryDate(product.lastDate)}</td><td
										class="px-4 py-3 text-right tabular-nums">{product.archivePoints}</td
									><td class="px-4 py-3 text-right whitespace-nowrap tabular-nums"
										>{money(product.price)}</td
									></tr
								>{/each}</tbody
						>
					</table>
				{:else if activeTab === 'sources'}
					<table class="w-full min-w-[650px] text-left text-sm">
						<thead class="bg-primary text-xs text-secondary"
							><tr
								><th class="px-4 py-3">Hinnaston päivä</th><th class="px-4 py-3">Aineisto</th><th
									class="px-4 py-3">Tunniste</th
								><th class="px-4 py-3">Alkuperäinen lähde</th></tr
							></thead
						><tbody
							>{#each sources.slice(start, start + size) as source}<tr
									class="border-t border-primary"
									><td class="px-4 py-3 font-medium">{formatHistoryDate(source.date)}</td><td
										class="px-4 py-3"
										>{source.format}
										<p class="text-xs text-secondary">
											{source.scope === 'special-order selection'
												? 'Tilausvalikoima'
												: 'Pää- tai yhdistetty valikoima'} · {source.language.toUpperCase()}
										</p></td
									><td class="px-4 py-3"
										><code class="text-xs" title={source.sha256}>{source.id}</code></td
									><td class="px-4 py-3"
										><a class="underline" href={source.url} target="_blank" rel="noreferrer"
											>Avaa hinnasto ↗</a
										></td
									></tr
								>{/each}</tbody
						>
					</table>
				{:else}
					{#if report.conflicts.length}<div class="border-b border-primary p-4">
							<h3 class="mb-2 font-semibold">Tallennettu hinta säilytetty</h3>
							{#each report.conflicts as row}<p class="text-sm text-secondary">
									{row.id} · {formatHistoryDate(row.date)} · Tallennettu {money(row.recordedPrice)},
									arkistossa {money(row.archivePrice)}.
									<a class="underline" href={row.sourceUrl} target="_blank" rel="noreferrer"
										>Tarkista lähde ↗</a
									>
								</p>{/each}
						</div>{/if}
					<table class="w-full min-w-[650px] text-left text-sm">
						<thead class="bg-primary text-xs text-secondary"
							><tr
								><th class="px-4 py-3">Nykyinen tuote</th><th class="px-4 py-3">Arkiston nimi</th
								><th class="px-4 py-3">Tarkistettava tieto</th><th class="px-4 py-3">Lähde</th></tr
							></thead
						><tbody
							>{#each reviews.slice(start, start + size) as row}<tr class="border-t border-primary"
									><td class="px-4 py-3"
										>{row.currentName}
										<p class="text-xs text-secondary">{row.id} · {row.currentVolume} l</p></td
									><td class="px-4 py-3"
										>{row.historicalName}
										<p class="text-xs text-secondary">{row.historicalVolume} l</p></td
									><td class="px-4 py-3">{reasons[row.reason] ?? row.reason}</td><td
										class="px-4 py-3"
										><a class="underline" href={row.sourceUrl} target="_blank" rel="noreferrer"
											>{formatHistoryDate(row.sampleDate)} ↗</a
										></td
									></tr
								>{/each}</tbody
						>
					</table>
				{/if}
			</div>
			{#if !count}<p class="p-8 text-center text-secondary">
					Hakua vastaavia tuloksia ei löytynyt.
				</p>{/if}
			<div
				class="flex flex-wrap items-center justify-between gap-3 border-t border-primary p-4 text-sm"
			>
				<p class="text-secondary">
					{count
						? `${number(start + 1)}–${number(Math.min(start + size, count))} / ${number(count)}`
						: '0 tulosta'}
				</p>
				<div class="flex items-center gap-3">
					<button
						class="rounded border border-primary px-3 py-1.5 disabled:opacity-40"
						disabled={currentPage <= 1}
						onclick={() => currentPage--}>← Edellinen</button
					><span class="text-xs text-secondary">{currentPage} / {pages}</span><button
						class="rounded border border-primary px-3 py-1.5 disabled:opacity-40"
						disabled={currentPage >= pages}
						onclick={() => currentPage++}>Seuraava →</button
					>
				</div>
			</div>
		</section>
		<p class="mt-5 text-xs leading-relaxed text-secondary">
			Työaineiston tunniste {report.version}. Nykyinen tuoteluettelo on synkronoitu {formatHistoryDate(
				report.baseLastSynced.slice(0, 10)
			)}. Tuotehistoria seuraa tuotenumeroa: nimen vuosikerta voi vaihtua. Vanhojen hinnastojen
			kattavuus vaihtelee; osa varhaisista aineistoista sisältää vain enintään 22-prosenttiset
			tuotteet.
		</p>
	{:else}
		<h1 class="text-2xl font-bold">Historialliset hinnat</h1>
		<p class="mt-3 text-secondary">Historiallista työaineistoa ei ole ladattuna tässä versiossa.</p>
		<a class="mt-5 inline-block underline" href={appPath('/')}>Palaa tuoteluetteloon</a>
	{/if}
</div>
