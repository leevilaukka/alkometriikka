<script lang="ts">
	import type { PriceListItem, VintageDocument } from '$lib/types';
	import { findVintageMatch } from '$lib/utils/vintages';
	import Icon from './Icon.svelte';

	const { product, vintages }: { product: PriceListItem; vintages: VintageDocument[] } = $props();

	const match = $derived(findVintageMatch(product, vintages));
	const years = $derived(
		match
			? Object.entries(match.region.ratings)
					.map(([year, score]) => ({ year, score }))
					.sort((a, b) => Number(b.year) - Number(a.year))
			: []
	);
</script>

{#if match}
	<section class="w-full overflow-hidden rounded border border-primary bg-secondary">
		<details open={match.score !== null}>
			<summary class="m-2 flex items-center gap-2 text-2xl font-bold">
				<Icon name="star" class="inline-block" />
				Vuosikerta-arvio
			</summary>
			<div class="flex flex-col gap-3 border-t border-primary px-4 py-3">
				<p class="text-sm text-secondary">
					{match.region.name}
					{#if match.document.title}
						&middot; {match.document.title}
					{/if}
				</p>
				{#if match.score !== null}
					<div class="flex items-center gap-3">
						<span class="text-4xl font-bold">{match.score}<span class="text-lg text-secondary">/20</span></span>
						<span class="text-secondary">Vuosikerta {match.vintage}</span>
					</div>
				{:else}
					<p class="text-secondary">
						{match.vintage
							? `Vuosikerralle ${match.vintage} ei löytynyt arviota, mutta alueen muita vuosikertoja on saatavilla alla.`
							: 'Tuotteella ei ole vuosikertaa, mutta alueen vuosikerta-arviot löytyvät alta.'}
					</p>
				{/if}
				{#if years.length > 0}
					<ul class="flex max-w-full flex-row flex-wrap gap-2">
						{#each years as { year, score } (year)}
							<li
								class={`flex flex-col items-center rounded border px-2 py-1 text-sm ${
									year === match.vintage
										? 'border-primary bg-primary-white font-bold'
										: 'border-primary/50'
								}`}
							>
								<span>{year}</span>
								<span>{score}/20</span>
							</li>
						{/each}
					</ul>
				{/if}
				<a
					href={match.document.source}
					target="_blank"
					rel="noopener noreferrer"
					class="w-fit text-sm text-secondary underline"
				>
					Lähde: Alkon vuosikertataulukko
				</a>
			</div>
		</details>
	</section>
{/if}
