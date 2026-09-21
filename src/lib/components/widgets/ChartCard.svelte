<script lang="ts">
	import {
		Chart,
		ArcElement,
		BarController,
		BarElement,
		CategoryScale,
		DoughnutController,
		Filler,
		Legend,
		LinearScale,
		LineController,
		LineElement,
		LogarithmicScale,
		PieController,
		PointElement,
		ScatterController,
		Title,
		Tooltip
	} from 'chart.js';
	import type { ChartConfiguration } from 'chart.js';

	Chart.register(
		ArcElement,
		BarController,
		BarElement,
		CategoryScale,
		DoughnutController,
		Filler,
		Legend,
		LinearScale,
		LineController,
		LineElement,
		LogarithmicScale,
		PieController,
		PointElement,
		ScatterController,
		Title,
		Tooltip
	);

	const {
		title,
		subtitle = '',
		config
	}: {
		title: string;
		subtitle?: string;
		config: ChartConfiguration;
	} = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let chart = $state<Chart | undefined>();

$effect(() => {
		if (!canvas) return;
		// Config objects are usually built via helper functions that return a
		// ChartConfiguration union; Chart accepts any of them.
	chart = new Chart(canvas, config as ConstructorParameters<typeof Chart>[1]) as Chart;

		return () => {
			chart?.destroy();
			chart = undefined;
		};
	});
</script>

<section class="overflow-hidden rounded border border-primary bg-secondary">
	<header class="flex flex-col gap-0.5 border-b border-primary px-4 py-3">
		<h2 class="text-lg font-semibold">{title}</h2>
		{#if subtitle}<p class="text-sm text-secondary">{subtitle}</p>{/if}
	</header>
	<div class="relative h-64 sm:h-80">
		<canvas bind:this={canvas} class="h-full w-full"></canvas>
	</div>
</section>