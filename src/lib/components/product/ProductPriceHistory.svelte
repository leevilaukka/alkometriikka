<script lang="ts">
	import { onMount } from 'svelte';
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import { getSaleInfo } from '$lib/utils/sales';
	import { sendAnalyticsEvent } from '$lib/utils/helpers';
	import type { PriceHistoryEntry, PriceListItem } from '$lib/types';
	import type { ChartConfiguration } from 'chart.js';
	import ChartCard from '../widgets/ChartCard.svelte';
	import { components } from '$lib/utils/styles';
	import { twMerge } from 'tailwind-merge';
	import { dev } from '$app/environment';

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
	const filteredHistory = $derived.by(() => {
		const range = ranges.find((r) => r.key === selectedRange);
		if (!range || range.days === null) return fullHistory;
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - range.days);
		const cutoffISO = cutoff.toISOString().slice(0, 10);
		return fullHistory.filter((entry) => entry.date >= cutoffISO);
	});

	function isSaleEntry(entry: PriceHistoryEntry): entry is PriceHistoryEntry & { normalPrice: number } {
		return entry.normalPrice != null && entry.price < entry.normalPrice;
	}

	const config = $derived.by<ChartConfiguration>(() => {
		const history = filteredHistory;
		const dates = history.map((entry) => entry.date);

		// Sale periods are built from the price-history data (recorded at sync
		// time) merged with the product's currently active campaign window, so
		// ongoing sales appear on the chart even before the next price change
		// records a new point.
		const windows: { start: string; end: string }[] = [];
		let run: { start: string; end: string } | null = null;
		history.forEach((entry) => {
			if (isSaleEntry(entry)) {
				if (!run) run = { start: entry.date, end: entry.date };
				else run.end = entry.date;
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

		const firstIndexFor = (date: string) => {
			for (let i = 0; i < dates.length; i++) {
				if (dates[i] >= date) return i;
			}
			return Math.max(0, dates.length - 1);
		};
		const lastIndexFor = (date: string) => {
			for (let i = dates.length - 1; i >= 0; i--) {
				if (dates[i] <= date) return i;
			}
			return 0;
		};

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
					const drawMarker = (date: string, index: number, label: string) => {
						const x = Math.max(chartArea.left, Math.min(chartArea.right, xScale.getPixelForValue(index)));
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
					if (w.start) drawMarker(w.start, firstIndexFor(w.start), 'Kampanja alkaa');
					if (w.end && w.end < todayISO) drawMarker(w.end, lastIndexFor(w.end), 'Kampanja päättyy');
				}
				ctx.restore();
			}
		};

		return {
			type: 'line',
			data: {
				labels: dates.map((date) => new Date(date).toLocaleDateString('fi-FI')),
				datasets: [
					{
						label: 'Hinta',
						data: history.map((entry) => entry.price),
						borderColor: 'rgba(75, 192, 192, 1)',
						backgroundColor: 'rgba(75, 192, 192, 0.2)',
						fill: true,
						tension: 0.1,
						pointRadius: history.map((entry) => (isSaleEntry(entry) ? 5 : 3)),
						pointBackgroundColor: history.map((entry) =>
							isSaleEntry(entry) ? 'rgba(239, 68, 68, 1)' : 'rgba(75, 192, 192, 1)'
						),
						pointBorderColor: history.map((entry) =>
							isSaleEntry(entry) ? 'rgba(255, 255, 255, 1)' : 'rgba(75, 192, 192, 1)'
						),
						tooltip: {
							callbacks: {
								label: function (context: any) {
									const entry = history[context.dataIndex];
									if (!entry) return '';
									const label = `Hinta: ${formatValue(entry.price, AllColumns.Price)}`;
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
				scales: {
					x: { title: { display: true, text: 'Päivämäärä' } },
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
					tooltip: { enabled: true, mode: 'index', intersect: false }
				}
			},
			plugins: [campaignLinePlugin]
		};
	});

	onMount(() => {
		if (fullHistory.length > 1) {
			sendAnalyticsEvent('show_price_history', { product_number: product[AllColumns.Number] });
		}
	});
</script>

{#if dev || fullHistory.length > 1}
	<div class={_class}>
		<ChartCard title="Hintahistoria" {config}>
			{#snippet headerEnd()}
				<div class="flex overflow-hidden rounded border border-primary bg-primary">
					{#each ranges as range (range.key)}
						<button
							type="button"
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
			{/snippet}
		</ChartCard>
	</div>
{/if}
