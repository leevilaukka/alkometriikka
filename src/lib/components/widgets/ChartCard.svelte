<script lang="ts" module>
	import type { Chart as ChartType, ChartConfiguration } from 'chart.js';

	let chartModule: Promise<typeof ChartType> | undefined;

	/**
	 * Chart.js, loaded with the first chart rather than with the page: it is most of a product
	 * page's code, and the chart sits below the fold in a box of fixed height
	 */
	function loadChart() {
		chartModule ??= import('chart.js').then((module) => {
			module.Chart.register(
				module.ArcElement,
				module.BarController,
				module.BarElement,
				module.CategoryScale,
				module.DoughnutController,
				module.Filler,
				module.Legend,
				module.LinearScale,
				module.LineController,
				module.LineElement,
				module.LogarithmicScale,
				module.PieController,
				module.PointElement,
				module.ScatterController,
				module.Title,
				module.Tooltip
			);
			// Redrawn once a resize settles rather than on every frame of one, e.g. while a sidebar
			// slides open, which would otherwise stall the animation
			module.Chart.defaults.resizeDelay = 150;
			return module.Chart;
		});
		return chartModule;
	}
</script>

<script lang="ts">
	const {
		title,
		subtitle = '',
		config,
		headerEnd
	}: {
		title: string;
		subtitle?: string;
		config: ChartConfiguration;
		headerEnd?: import('svelte').Snippet;
	} = $props();

	let canvas: HTMLCanvasElement | undefined = $state();

	$effect(() => {
		if (!canvas) return;
		// Read here, not once Chart.js has loaded, so a new config re-creates the chart
		const target = canvas;
		const current = config;
		let chart: ChartType | undefined;
		let destroyed = false;
		loadChart().then((Chart) => {
			if (destroyed) return;
			// Config objects are usually built via helper functions that return a
			// ChartConfiguration union; Chart accepts any of them.
			chart = new Chart(target, current as ConstructorParameters<typeof Chart>[1]) as ChartType;
		});

		return () => {
			destroyed = true;
			chart?.destroy();
		};
	});
</script>

<section class="overflow-hidden rounded border border-primary bg-secondary">
	<header class="flex flex-wrap items-center gap-3 border-b border-primary px-4 py-3">
		<div class="flex flex-col gap-0.5">
			<h2 class="text-lg font-semibold">{title}</h2>
			{#if subtitle}<p class="text-sm text-secondary">{subtitle}</p>{/if}
		</div>
		{#if headerEnd}<div class="ml-auto shrink-0">{@render headerEnd()}</div>{/if}
	</header>
	<div class="relative h-64 sm:h-80">
		<canvas bind:this={canvas} class="h-full w-full"></canvas>
	</div>
</section>
