<script lang="ts">
	import { AllColumns } from '$lib/utils/constants/columns';
	import { formatValue } from '$lib/utils/format/format';
	import { getSaleInfo } from '$lib/utils/catalog/sales';
	import { productFeedPath } from '$lib/utils/catalog/alko';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import type { PriceHistoryEntry, PriceListItem } from '$lib/types';
	import type { ChartConfiguration, TooltipItem } from 'chart.js';
	import ChartCard from '../widgets/ChartCard.svelte';
	import Icon from '../widgets/Icon.svelte';
	import { components } from '$lib/utils/ui/styles';
	import { twMerge } from 'tailwind-merge';
	import { dev } from '$app/environment';
	import { appPath } from '$lib/utils/app/paths';
	import {
		formatHistoryDate,
		historyTimestamp,
		priceHistoryChartPoints
	} from '$lib/utils/catalog/priceHistory';

	const { product, class: _class = '' }: { product: PriceListItem; class?: string } = $props();

	type RangeKey = '1kk' | '3kk' | '1v' | 'kaikki';
	const ranges: { key: RangeKey; label: string; days: number | null }[] = [
		{ key: '1kk', label: '1kk', days: 30 },
		{ key: '3kk', label: '3kk', days: 90 },
		{ key: '1v', label: '1v', days: 365 },
		{ key: 'kaikki', label: 'Kaikki', days: null }
	];

	let selectedRange: RangeKey = $state('kaikki');

	const fullHistory = $derived(product[AllColumns.History] ?? []);
	const archiveEntries = $derived(fullHistory.filter((entry) => entry.archive));
	const liveHistory = $derived(fullHistory.filter((entry) => !entry.archive));
	// Same rule as scripts/site/rss.ts: a product gets a feed once its price has changed
	const feedHref = $derived(
		liveHistory.some((entry, index) => index > 0 && entry.price !== liveHistory[index - 1].price)
			? `/rss/${encodeURIComponent(product[AllColumns.Number])}.xml`
			: undefined
	);
	const chartPoints = $derived.by(() => {
		const range = ranges.find((r) => r.key === selectedRange);
		if (!range || range.days === null) return priceHistoryChartPoints(fullHistory);
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - range.days);
		const cutoffISO = cutoff.toISOString().slice(0, 10);
		return priceHistoryChartPoints(fullHistory, cutoffISO);
	});

	function isSaleEntry(
		entry: PriceHistoryEntry
	): entry is PriceHistoryEntry & { normalPrice: number } {
		return entry.normalPrice != null && entry.price < entry.normalPrice;
	}

	const config = $derived.by<ChartConfiguration>(() => {
		const history = chartPoints.flatMap((point) => (point ? [point.entry] : []));
		const visibleDates = chartPoints.flatMap((point) => (point ? [point.x] : []));
		const firstDate = visibleDates[0];
		const lastDate = visibleDates.at(-1);
		const longRange =
			firstDate != null && lastDate != null && lastDate - firstDate > 730 * 86400000;

		// Sale periods are built from the price-history data (recorded at sync
		// time) merged with the product's currently active campaign window, so
		// ongoing sales appear on the chart even before the next price change
		// records a new point.
		const windows: { start: string; end: string }[] = [];
		let run: { start: string; end: string } | null = null;
		history.forEach((entry) => {
			if (isSaleEntry(entry)) {
				// The point may be recorded before the campaign starts, so prefer the real start date.
				if (!run) {
					const start =
						entry.campaignStart && entry.campaignStart > entry.date
							? entry.campaignStart
							: entry.date;
					run = { start, end: entry.date };
				} else run.end = entry.date;
				if (entry.campaignStart && entry.campaignStart < run.start) run.start = entry.campaignStart;
				if (entry.campaignEnd && entry.campaignEnd > run.end) run.end = entry.campaignEnd;
			} else if (run) {
				windows.push(run);
				run = null;
			}
		});
		if (run) windows.push(run);

		const currentSale = getSaleInfo({
			price: product[AllColumns.Price],
			normalPrice: product[AllColumns.NormalPrice],
			campaignStart: product[AllColumns.CampaignStart],
			campaignEnd: product[AllColumns.CampaignEnd]
		});
		if (currentSale) {
			windows.push({
				start: currentSale.campaignStart ?? history[0]?.date ?? '',
				end: currentSale.campaignEnd ?? ''
			});
		}

		const now = new Date();
		const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
			now.getDate()
		).padStart(2, '0')}`;

		// Vertical "Kampanja" marker lines: one at the campaign start date and
		// another at the end date once it is known.
		const campaignLinePlugin = {
			id: 'campaignLinePlugin',
			afterDatasetsDraw(chart: any) {
				const { ctx, chartArea, scales } = chart;
				const xScale = scales.x;
				if (!chartArea || !xScale || windows.length === 0) return;
				ctx.save();
				ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
				ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
				ctx.lineWidth = 1.5;
				ctx.font = '12px Inter, system-ui, sans-serif';
				for (const w of windows) {
					const drawMarker = (date: string, label: string) => {
						const x = Math.max(
							chartArea.left,
							Math.min(chartArea.right, xScale.getPixelForValue(historyTimestamp(date)))
						);
						const labelGap = 22;
						ctx.setLineDash([6, 4]);
						ctx.beginPath();
						ctx.moveTo(x, chartArea.top + labelGap);
						ctx.lineTo(x, chartArea.bottom);
						ctx.stroke();
						ctx.setLineDash([]);
						ctx.textAlign = 'center';
						ctx.textBaseline = 'top';
						const halfWidth = ctx.measureText(label).width / 2;
						const textX = Math.max(
							chartArea.left + halfWidth + 4,
							Math.min(chart.width - halfWidth - 4, x)
						);
						ctx.fillText(label, textX, chartArea.top + 3);
					};
					if (w.start) drawMarker(w.start, 'Kampanja alkaa');
					if (w.end && w.end < todayISO) drawMarker(w.end, 'Kampanja päättyy');
				}
				ctx.restore();
			}
		};

		return {
			type: 'line',
			data: {
				datasets: [
					{
						label: 'Hinta',
						data: chartPoints.map((point, index) => {
							if (point) return { x: point.x, y: point.y };
							const previous = chartPoints[index - 1];
							const next = chartPoints[index + 1];
							// Object-mode parsing needs an x value even for a skipped point.
							return { x: previous && next ? (previous.x + next.x) / 2 : 0, y: Number.NaN };
						}),
						borderColor: 'rgba(75, 192, 192, 1)',
						backgroundColor: 'rgba(75, 192, 192, 0.2)',
						fill: false,
						tension: 0,
						stepped: 'after',
						spanGaps: false,
						segment: {
							borderColor: (context) =>
								chartPoints[context.p1DataIndex]?.entry.archive
									? '#d97706'
									: 'rgba(75, 192, 192, 1)'
						},
						pointRadius: chartPoints.map((point) =>
							!point
								? 0
								: point.boundary
									? 2
									: isSaleEntry(point.entry)
										? 5
										: point.entry.archive
											? 4
											: 3
						),
						pointBackgroundColor: chartPoints.map((point) =>
							point?.entry.archive
								? '#d97706'
								: point && isSaleEntry(point.entry)
									? 'rgba(239, 68, 68, 1)'
									: 'rgba(75, 192, 192, 1)'
						),
						pointBorderColor: chartPoints.map((point) =>
							point?.entry.archive
								? '#d97706'
								: point && isSaleEntry(point.entry)
									? 'rgba(255, 255, 255, 1)'
									: 'rgba(75, 192, 192, 1)'
						),
						tooltip: {
							callbacks: {
								label: function (context: any) {
									const entry = chartPoints[context.dataIndex]?.entry;
									if (!entry) return '';
									const label = `Hinta: ${formatValue(entry.price, AllColumns.Price)}`;
									if (entry.archive) return `${label} · Arkistohavainto (hinnaston päivä)`;
									if (isSaleEntry(entry)) {
										const discount = Math.round((1 - entry.price / entry.normalPrice) * 100);
										return `${label} · Normaalihinta ${formatValue(entry.normalPrice, AllColumns.NormalPrice)} · Alennus ${discount}%`;
									}
									return label;
								}
							}
						}
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					x: {
						type: 'linear',
						...(firstDate != null && lastDate != null && firstDate < lastDate
							? { min: firstDate, max: lastDate }
							: {}),
						title: { display: true, text: 'Päivämäärä' },
						ticks: {
							maxTicksLimit: 7,
							callback: (value) =>
								longRange
									? new Date(Number(value)).getUTCFullYear().toString()
									: formatHistoryDate(Number(value))
						}
					},
					y: {
						ticks: {
							callback: function (value) {
								return String(formatValue(Number(value), AllColumns.Price));
							}
						},
						title: { display: true, text: 'Hinta (€)' }
					}
				},
				plugins: {
					legend: { display: false, position: 'top' },
					title: { display: false },
					tooltip: {
						enabled: true,
						mode: 'index',
						intersect: false,
						callbacks: {
							title: (contexts: TooltipItem<'line'>[]) =>
								contexts[0]?.parsed.x != null ? formatHistoryDate(contexts[0].parsed.x) : ''
						}
					}
				}
			},
			plugins: [campaignLinePlugin]
		};
	});
</script>

<svelte:head>
	{#if feedHref}
		<link
			rel="alternate"
			type="application/rss+xml"
			title={`${product[AllColumns.Name]} – hintamuutokset`}
			href={feedHref}
		/>
	{/if}
</svelte:head>

{#if dev || fullHistory.length > 1}
	<div class={_class}>
		<ChartCard title="Hintahistoria" {config}>
			{#snippet headerEnd()}
				<div class="flex items-center gap-2">
					{#if feedHref}
						<a
							href={feedHref}
							onclick={() =>
								sendAnalyticsEvent('click_feed', { feed: 'product', location: 'price_history' })}
							class="flex items-center gap-1 rounded px-1.5 py-1 text-sm text-secondary hover:bg-primary"
							title="Tilaa tuotteen hinnanmuutokset RSS-syötteenä"
							aria-label="Tilaa tuotteen hinnanmuutokset RSS-syötteenä"
						>
							<Icon name="rss" />
							<span class="hidden sm:inline">RSS</span>
						</a>
					{/if}
					<div class="flex overflow-hidden rounded border border-primary bg-primary">
						{#each ranges as range (range.key)}
							<button
								type="button"
								aria-pressed={selectedRange === range.key}
								class={twMerge(
									'px-2.5 py-1 text-sm',
									selectedRange === range.key ? 'bg-secondary font-bold' : 'hover:bg-secondary'
								)}
								onclick={() => (selectedRange = range.key)}
							>
								{range.label}
							</button>
						{/each}
					</div>
				</div>
			{/snippet}
		</ChartCard>
		{#if archiveEntries.length}
			<div
				class="mt-3 rounded border border-amber-500/40 bg-amber-500/5 p-4 text-sm"
				data-testid="archive-evidence"
			>
				<p>
					<span class="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-amber-600"></span><strong
						>Arkistoidut hinnastot</strong
					>
				</p>
				<p class="mt-1 text-secondary">
					Oranssit pisteet ovat hinnaston päivältä havaittuja hintoja. Havaintojen välisiä aukkoja
					ei ole täytetty; tarkka hinnanmuutospäivä ei aina ole tiedossa.
				</p>
				<details class="mt-3">
					<summary class="cursor-pointer font-medium"
						>Näytä arkistohavaintojen lähteet ({archiveEntries.length})</summary
					>
					<div class="mt-3 max-h-64 overflow-auto">
						<table class="w-full text-left">
							<thead
								><tr class="border-b border-primary"
									><th class="py-2">Havaittu</th><th>Hinta</th><th>Lähde</th></tr
								></thead
							>
							<tbody
								>{#each archiveEntries as entry}
									<tr class="border-primary/50 border-b"
										><td class="py-2"
											>{formatHistoryDate(
												entry.date
											)}{#if entry.archive!.lastObserved !== entry.date}
												– {formatHistoryDate(entry.archive!.lastObserved)}{/if}</td
										><td>{formatValue(entry.price, AllColumns.Price)}</td><td
											><a
												class="underline"
												href={appPath(`/historia/?source=${entry.archive!.sourceId}`)}
												>Hinnasto ja lähdetiedot</a
											></td
										></tr
									>
								{/each}</tbody
							>
						</table>
					</div>
				</details>
			</div>
		{/if}
	</div>
{/if}
