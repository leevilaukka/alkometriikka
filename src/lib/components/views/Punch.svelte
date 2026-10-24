<script lang="ts" module>
	/**
	 * The composition bars' categorical colours, `[light, dark]`, from the validated default
	 * palette (adjacent pairs pass the colour-blindness checks in both themes). An ingredient
	 * keeps its colour while it's in the recipe; past seven, the rest share the grey.
	 */
	const SERIES = [
		['#2a78d6', '#3987e5'],
		['#eb6834', '#d95926'],
		['#1baf7a', '#199e70'],
		['#eda100', '#c98500'],
		['#e87ba4', '#d55181'],
		['#008300', '#008300'],
		['#6250d6', '#9085e9']
	] as const;
	const OTHER = ['#a1a1aa', '#71717a'] as const;

	const GLASS_SIZES = [0.1, 0.15, 0.2, 0.25, 0.3, 0.4];
</script>

<script lang="ts">
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import type { Kaljakori } from '$lib/alko';
	import type { AvailabilityData, PriceListItem } from '$lib/types';
	import {
		isLaptop,
		lists,
		pageBottomBar,
		personalInfo,
		preferredStoreId,
		punchDraft,
		punchRecipes,
		userLocation
	} from '$lib/global.svelte';
	import {
		cheaperAlternative,
		computePunch,
		decodePunch,
		emptyPunch,
		encodePunch,
		mixerForTarget,
		punchLines,
		PUNCH_MIXERS,
		PUNCH_TEMPLATES,
		resolveTemplate,
		scalePunch,
		type CustomIngredient,
		type PunchRecipe,
		type PunchSwap,
		type PunchTemplate
	} from '$lib/utils/catalog/punch';
	import { resolvePreferredStore } from '$lib/utils/catalog/availability';
	import { AllColumns } from '$lib/utils/constants/columns';
	import { ShareTypes } from '$lib/utils/constants/app';
	import { formatValue } from '$lib/utils/format/format';
	import { handleShare } from '$lib/utils/app/share';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { requestSettingsOpen } from '$lib/utils/app/settings';
	import { appPath } from '$lib/utils/app/paths';
	import { createListId, listToURI } from '$lib/utils/user/lists';
	import { addProductToPunch, deletePunch, openPunch, savePunch } from '$lib/utils/user/punch';
	import { components } from '$lib/utils/ui/styles';
	import PunchIngredientRow from '../punch/PunchIngredientRow.svelte';
	import PunchProductSearch from '../punch/PunchProductSearch.svelte';
	import PunchResults from '../punch/PunchResults.svelte';
	import BottomBar from '../widgets/BottomBar.svelte';
	import Icon from '../widgets/Icon.svelte';
	import Popup from '../widgets/Popup.svelte';

	const {
		alko
	}: {
		/** The layout's data, read through its getters so store data fills in when it loads */
		alko: { kaljakori: Kaljakori; availability: AvailabilityData; availabilityLoaded: boolean };
	} = $props();

	const kaljakori = $derived(alko.kaljakori);

	const preferredStore = $derived(
		resolvePreferredStore(alko.availability.stores, $preferredStoreId, $userLocation)
	);
	/** Whether the preferred store has a product; undefined without a store or its data */
	const inStore = $derived.by(() => {
		if (!preferredStore || !alko.availabilityLoaded) return undefined;
		const { id } = preferredStore;
		const stock = alko.availability.product;
		return (product: PriceListItem) => stock[product[AllColumns.Number]]?.includes(id) ?? false;
	});

	// Rows are keyed and coloured by ingredient. The draft's proxies stay the same object while the
	// ingredient is in the recipe, and a recipe opened in its place gets new ones
	let nextKey = 0;
	const keys = new WeakMap<object, number>();
	const keyOf = (ingredient: object) => {
		let key = keys.get(ingredient);
		if (key === undefined) keys.set(ingredient, (key = nextKey++));
		return key;
	};
	const slots = new WeakMap<object, number>();
	const colors = $derived.by(() => {
		const used = new Set<number>();
		for (const ingredient of punchDraft.ingredients) {
			const slot = slots.get(ingredient);
			if (slot !== undefined && slot >= 0) used.add(slot);
		}
		return punchDraft.ingredients.map((ingredient) => {
			let slot = slots.get(ingredient);
			if (slot === undefined) {
				slot = SERIES.findIndex((_, index) => !used.has(index));
				if (slot >= 0) used.add(slot);
				slots.set(ingredient, slot);
			}
			return slot >= 0 ? SERIES[slot] : OTHER;
		});
	});

	const lines = $derived(punchLines(punchDraft.ingredients, (id) => kaljakori.findById(id)));
	const totals = $derived(
		computePunch(lines, {
			glass: punchDraft.glass,
			people: punchDraft.people,
			gender: personalInfo.gender,
			weight: personalInfo.weight
		})
	);
	const hasIngredients = $derived(punchDraft.ingredients.length > 0);

	const swaps = $derived(
		lines.map((line) =>
			line.product && line.count > 0
				? cheaperAlternative(line.product, line.count, kaljakori.data, inStore)
				: null
		)
	);

	// Alcohol per euro of the active products, sorted, for placing the punch among them
	const catalogGramsPerEuro = $derived(
		kaljakori.data
			.filter((product) => product[AllColumns.RemovedFromSelection] !== true)
			.map((product) => Number(product[AllColumns.AlcoholGramsPerEuro]))
			.filter((value) => Number.isFinite(value) && value > 0)
			.sort((a, b) => b - a)
	);
	const rank = $derived.by(() => {
		if (totals.gramsPerEuro === null) return null;
		const value = totals.gramsPerEuro;
		const better = catalogGramsPerEuro.findIndex((other) => other <= value);
		return {
			rank: (better === -1 ? catalogGramsPerEuro.length : better) + 1,
			total: catalogGramsPerEuro.length
		};
	});

	let target = $state<number | null>(null);
	const mixerNeeded = $derived(target ? mixerForTarget(totals, target) : null);

	let notice = $state('');
	let noticeTimeout: ReturnType<typeof setTimeout> | undefined;
	function flash(message: string) {
		notice = message;
		clearTimeout(noticeTimeout);
		noticeTimeout = setTimeout(() => (notice = ''), 3000);
	}

	let hasUserEdited = false;
	const edited = () => (hasUserEdited = true);

	/** Compares recipes by what they're made of, for knowing whether replacing one loses anything */
	const recipeKey = (recipe: PunchRecipe) =>
		JSON.stringify([recipe.glass, recipe.people, recipe.ingredients]);

	const isSaved = $derived(
		punchRecipes.some(
			(saved) => saved.name === punchDraft.name && recipeKey(saved) === recipeKey(punchDraft)
		)
	);

	/** Asks first when replacing would lose a recipe that isn't saved */
	function confirmReplace() {
		return !hasIngredients || isSaved || confirm('Nykyinen booli korvataan. Jatketaanko?');
	}

	function useTemplate(template: PunchTemplate) {
		if (!confirmReplace()) return;
		const recipe = resolveTemplate(template, kaljakori.data, inStore);
		openPunch({ ...recipe, people: punchDraft.people });
		edited();
		sendAnalyticsEvent('punch_template_used', { template: template.id });
	}

	function addProduct(product: PriceListItem) {
		addProductToPunch(product[AllColumns.Number]);
		edited();
	}

	function addCustom(mixer?: CustomIngredient) {
		punchDraft.ingredients.push(
			mixer ? { ...mixer } : { kind: 'custom', name: '', volume: 1, abv: 0, price: 0, count: 1 }
		);
		edited();
	}

	function removeIngredient(index: number) {
		punchDraft.ingredients.splice(index, 1);
		edited();
	}

	function applySwap(index: number, swap: PunchSwap) {
		const ingredient = punchDraft.ingredients[index];
		if (ingredient?.kind !== 'alko') return;
		sendAnalyticsEvent('punch_swap', {
			from: ingredient.id,
			to: swap.product[AllColumns.Number],
			saving: Math.round(swap.saving * 100) / 100
		});
		ingredient.id = swap.product[AllColumns.Number];
		ingredient.count = swap.count;
		edited();
	}

	function scale(factor: number) {
		scalePunch(punchDraft, factor);
		edited();
	}

	function clearPunch() {
		if (!confirmReplace()) return;
		openPunch(emptyPunch());
		target = null;
	}

	function defaultName() {
		return `Booli ${new Date().toLocaleDateString('fi-FI')}`;
	}

	function save() {
		const name = punchDraft.name.trim() || defaultName();
		savePunch(name);
		flash(`Tallennettu: ${name}`);
	}

	/** False when the user chose to keep the recipe that's open */
	function openSaved(recipe: PunchRecipe) {
		if (recipeKey(recipe) !== recipeKey(punchDraft) && !confirmReplace()) return false;
		openPunch(recipe);
		target = null;
		return true;
	}

	function removeSaved(id: string, name: string) {
		if (confirm(`Poistetaanko tallennettu booli "${name}"?`)) deletePunch(id);
	}

	const shareTitle = $derived(punchDraft.name.trim() || 'Booli');

	async function share() {
		const url = new URL(resolve('/boolilaskuri/'), location.origin);
		url.searchParams.set('booli', encodePunch(punchDraft));
		const summary = `${shareTitle}: ${formatValue(totals.abv, AllColumns.AlcoholPercentage)}, ${formatValue(totals.perGlass.price, AllColumns.Price)} per lasi`;
		try {
			const shared = await handleShare({
				type: ShareTypes.Punch,
				title: shareTitle,
				text: summary,
				url: url.toString(),
				includeSID: true
			});
			if (!shared) flash('Linkki kopioitu leikepöydälle');
		} catch {
			flash('Jakaminen epäonnistui');
		}
	}

	/** The Alko products as a shopping list, in whole packages */
	function toShoppingList() {
		const items = new Map<string, number>();
		for (const ingredient of punchDraft.ingredients) {
			if (ingredient.kind !== 'alko' || !(ingredient.count > 0)) continue;
			items.set(ingredient.id, (items.get(ingredient.id) ?? 0) + ingredient.count);
		}
		if (!items.size) return;
		const list = {
			id: createListId(),
			name: shareTitle,
			items: [...items].map(([id, count]) => ({ id, q: Math.ceil(count) }))
		};
		lists.push(list);
		sendAnalyticsEvent('punch_to_list', { products: list.items.length });
		goto(appPath(`/listat/?list=${listToURI(list)}`));
	}

	const alkoCount = $derived(
		punchDraft.ingredients.filter((ingredient) => ingredient.kind === 'alko').length
	);

	// A shared recipe opens right away over an empty or saved one, and otherwise asks first
	let sharedRecipe = $state<PunchRecipe | null>(null);
	let sharedFailed = $state(false);
	onMount(() => {
		const param = page.url.searchParams.get('booli');
		if (param === null) return;
		const recipe = decodePunch(param);
		if (!recipe) sharedFailed = true;
		else if (!hasIngredients || isSaved || recipeKey(recipe) === recipeKey(punchDraft))
			openPunch(recipe);
		else sharedRecipe = recipe;
		// Editing the recipe shouldn't leave a link to the shared one in the address bar
		// From the address bar, which the layout may have changed already (it strips `sid`)
		const url = new URL(location.href);
		url.searchParams.delete('booli');
		replaceState(url, page.state);
	});

	function openShared() {
		if (sharedRecipe) openPunch(sharedRecipe);
		sharedRecipe = null;
	}

	// Reported once the recipe has stayed the same for a few seconds, not on every keystroke,
	// and not again for a result that was just reported (a rename, a reorder or an undone edit)
	let lastReported = '';
	$effect(() => {
		const event = {
			ingredients: punchDraft.ingredients.length,
			alko_products: alkoCount,
			volume: Math.round(totals.volume * 100) / 100,
			abv: Math.round(totals.abv * 10) / 10,
			price: Math.round(totals.price * 100) / 100,
			people: punchDraft.people
		};
		if (!hasUserEdited || event.ingredients < 2) return;
		const key = JSON.stringify(event);
		if (key === lastReported) return;
		const timeout = setTimeout(() => {
			lastReported = key;
			sendAnalyticsEvent('punch_calculator_used', event);
		}, 3000);
		return () => clearTimeout(timeout);
	});

	function updateGlass(event: Event) {
		const decilitres = (event.currentTarget as HTMLInputElement).valueAsNumber;
		if (decilitres > 0) punchDraft.glass = Math.min(20, decilitres) / 10;
	}

	function stepPeople(delta: number) {
		punchDraft.people = Math.min(500, Math.max(1, Math.round(punchDraft.people || 1) + delta));
	}

	/** Gap the sticky results column keeps to the scroll area's edges, in px (Tailwind's 4) */
	const STICKY_GAP = 16;
	let resultsColumn = $state<HTMLElement>();
	let resultsFit = $state(true);
	// The results stay in view only while they fit. Pinned by their top, taller ones would hide their
	// end until the page ends, and pinning them by their bottom instead broke wheel scrolling over
	// them in some browsers. So taller ones scroll with the page.
	$effect(() => {
		const column = resultsColumn;
		if (!column) return;
		let scroller = column.parentElement;
		while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY))
			scroller = scroller.parentElement;
		const area = scroller ?? document.documentElement;
		const observer = new ResizeObserver(() => {
			resultsFit = column.offsetHeight + 2 * STICKY_GAP <= area.clientHeight;
		});
		observer.observe(column);
		observer.observe(area);
		return () => observer.disconnect();
	});

	function scrollToResults() {
		const target = document.getElementById('punch-results');
		if (!target) return;
		// scrollIntoView also scrolls overflow-hidden ancestors, shifting the whole layout, so only
		// the nearest real scroll container is moved.
		let scroller = target.parentElement;
		while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY))
			scroller = scroller.parentElement;
		if (!scroller) return target.scrollIntoView({ behavior: 'smooth' });
		const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
		const top =
			target.getBoundingClientRect().top -
			scroller.getBoundingClientRect().top +
			scroller.scrollTop;
		scroller.scrollTo({ top: top - margin, behavior: 'smooth' });
	}

	$effect(() => {
		if (!$isLaptop) return;
		pageBottomBar.snippet = bottomBar;
		return () => {
			if (pageBottomBar.snippet === bottomBar) pageBottomBar.snippet = undefined;
		};
	});

	const card = 'flex flex-col gap-4 rounded border border-primary bg-secondary p-4 md:p-6';
	const chip = (selected = false) =>
		twMerge(
			components.button({ size: 'sm' }),
			'rounded-full px-3',
			selected ? 'border-brand-2 bg-brand-4 text-white hover:bg-brand-3 dark:bg-brand-4' : ''
		);
</script>

{#snippet bottomBar()}
	{#if hasIngredients}
		<BottomBar class="lg:hidden">
			<div class="flex min-w-0 flex-1 flex-col">
				<span class="truncate font-semibold tabular-nums">
					{formatValue(totals.abv, AllColumns.AlcoholPercentage)} · {formatValue(
						totals.perGlass.price,
						AllColumns.Price
					)}/lasi
				</span>
				<span class="truncate text-xs text-secondary tabular-nums">
					{formatValue(totals.glasses, undefined, {
						numberFormatOptions: { maximumFractionDigits: 1 }
					})} lasillista · yhteensä {formatValue(totals.price, AllColumns.Price)}
				</span>
			</div>
			<button
				type="button"
				class={twMerge(components.button({ size: 'lg' }), 'h-11')}
				onclick={scrollToResults}
			>
				<Icon name="chevron_down" />
				Tulokset
			</button>
		</BottomBar>
	{/if}
{/snippet}

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-8">
	<header class="flex flex-col gap-2">
		<!-- The saved recipes' button shares the title's row, so it takes no row of its own on phones -->
		<div class="flex items-center justify-between gap-3">
			<h1 class="text-2xl font-bold md:text-3xl">Boolilaskuri</h1>
			<Popup class="w-[min(60ch,_100%)] gap-4 p-4">
				{#snippet renderButton(dialogElement: HTMLDialogElement)}
					<button
						type="button"
						class={twMerge(components.button(), 'shrink-0')}
						onclick={() => dialogElement.showModal()}
						aria-label={`Tallennetut boolit${punchRecipes.length ? ` (${punchRecipes.length})` : ''}`}
					>
						<Icon name="bookmark" />
						<span>
							Tallennetut<span class="hidden sm:inline">{' '}boolit</span>{punchRecipes.length
								? ` (${punchRecipes.length})`
								: ''}
						</span>
					</button>
				{/snippet}
				{#snippet renderContent(dialogElement: HTMLDialogElement)}
					<h2 class="text-xl">Tallennetut boolit</h2>
					{#if punchRecipes.length}
						<ul class="flex flex-col">
							{#each punchRecipes as saved (saved.id)}
								<li class="flex items-center gap-2 border-t border-primary py-2 first:border-t-0">
									<div class="flex min-w-0 flex-1 flex-col">
										<span class="truncate font-semibold">{saved.name}</span>
										<span class="text-xs text-secondary">
											{saved.ingredients.length} ainesosaa{saved.savedAt
												? ` · ${new Date(saved.savedAt).toLocaleDateString('fi-FI')}`
												: ''}
										</span>
									</div>
									<button
										type="button"
										class={components.button()}
										onclick={() => {
											if (openSaved(saved)) dialogElement.close();
										}}
									>
										Avaa
									</button>
									<button
										type="button"
										class={twMerge(components.button({ type: 'noborder' }), 'aspect-square')}
										onclick={() => removeSaved(saved.id, saved.name)}
										aria-label={`Poista ${saved.name}`}
									>
										<Icon name="trash" class="text-secondary" />
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-secondary">
							Ei vielä tallennettuja booleja. Tallenna nykyinen booli Ainesosat-kohdan
							Tallenna-painikkeella.
						</p>
					{/if}
				{/snippet}
			</Popup>
		</div>
		<p class="max-w-2xl text-secondary">
			Kokoa booli Alkon tuotteista ja kaupan mehuista. Näet boolin vahvuuden, hinnan lasillista ja
			henkeä kohden sekä halvemmat vaihtoehdot samanlaisille juomille.
		</p>
	</header>

	{#if sharedRecipe}
		<div
			class="flex flex-wrap items-center gap-3 rounded border border-brand-2 bg-brand-4 p-4 text-white"
		>
			<Icon name="cocktail" class="text-xl" />
			<p class="min-w-0 flex-1">
				Sinulle jaettiin booli{sharedRecipe.name ? ` "${sharedRecipe.name}"` : ''} ({sharedRecipe
					.ingredients.length} ainesosaa). Sen avaaminen korvaa nykyisen boolisi.
			</p>
			<button type="button" class={components.button()} onclick={openShared}>Avaa jaettu booli</button>
			<button
				type="button"
				class={twMerge(components.button({ type: 'noborder' }), 'text-white hover:bg-brand-3')}
				onclick={() => (sharedRecipe = null)}
			>
				Ohita
			</button>
		</div>
	{:else if sharedFailed}
		<p class="flex items-center gap-2 rounded border border-primary bg-secondary p-4">
			<Icon name="alert_triangle" />
			Jaettua boolia ei voitu lukea. Tarkista linkki.
		</p>
	{/if}

	<section aria-labelledby="punch-templates-title" class="flex flex-col gap-2">
		<h2 id="punch-templates-title" class="font-semibold">Aloita valmiista pohjasta</h2>
		<p class="text-sm text-secondary">
			Pohja valitsee kuhunkin juomaan Alkon edullisimman annoshinnan tuotteen{preferredStore
				? ` myymälästä ${preferredStore.name}, jos saatavilla.`
				: ''}.
		</p>
		<div
			class="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-5 md:px-0"
		>
			{#each PUNCH_TEMPLATES as template (template.id)}
				<button
					type="button"
					class="flex w-48 shrink-0 snap-start flex-col gap-1 rounded border border-primary bg-primary p-3 text-start transition hover:cursor-pointer hover:bg-secondary md:w-auto"
					onclick={() => useTemplate(template)}
				>
					<span class="font-semibold">{template.name}</span>
					<span class="text-xs text-secondary">{template.description}</span>
				</button>
			{/each}
		</div>
	</section>

	<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
		<div class="flex flex-col gap-6">
			<section aria-labelledby="punch-ingredients-title" class={card}>
				<div class="flex flex-wrap items-end gap-2">
					<label class="flex min-w-0 flex-1 flex-col gap-1" for="punch-name">
						<span id="punch-ingredients-title" class="text-lg font-bold">Ainesosat</span>
						<input
							id="punch-name"
							class={twMerge(components.input(), 'w-full')}
							bind:value={punchDraft.name}
							maxlength="80"
							placeholder="Boolin nimi, esim. Vappubooli"
						/>
					</label>
					<button
						type="button"
						class={components.button()}
						onclick={save}
						disabled={!hasIngredients}
					>
						<Icon name="save" />
						{isSaved ? 'Tallennettu' : 'Tallenna'}
					</button>
				</div>

				<PunchProductSearch {kaljakori} {inStore} onadd={addProduct} />

				<div class="flex flex-col gap-1.5">
					<span class="text-sm">Lisää muu ainesosa</span>
					<div class="flex flex-wrap gap-1.5">
						{#each PUNCH_MIXERS as mixer (mixer.name)}
							<button type="button" class={chip()} onclick={() => addCustom(mixer)}>
								<Icon name="plus" />
								{mixer.name}
							</button>
						{/each}
						<button type="button" class={chip()} onclick={() => addCustom()}>
							<Icon name="pencil" />
							Oma ainesosa
						</button>
					</div>
					<p class="text-xs text-secondary">
						Kaupan tuotteiden hinnat ovat arvioita, muokkaa ne omiksesi.
					</p>
				</div>

				{#if hasIngredients}
					<ul class="flex flex-col">
						{#each punchDraft.ingredients as ingredient, index (keyOf(ingredient))}
							<PunchIngredientRow
								{ingredient}
								line={lines[index]}
								color={colors[index]}
								swap={swaps[index]}
								swapInStore={inStore !== undefined}
								inStore={lines[index].product && inStore
									? inStore(lines[index].product)
									: undefined}
								onremove={() => removeIngredient(index)}
								onswap={(swap) => applySwap(index, swap)}
							/>
						{/each}
					</ul>
					<div class="flex flex-wrap gap-2 border-t border-primary pt-4">
						<button type="button" class={components.button()} onclick={() => scale(0.5)}>
							Puolita
						</button>
						<button type="button" class={components.button()} onclick={() => scale(2)}>
							Tuplaa
						</button>
						<button
							type="button"
							class={twMerge(components.button({ type: 'noborder' }), 'ms-auto')}
							onclick={clearPunch}
						>
							<Icon name="trash" />
							Tyhjennä
						</button>
					</div>
				{:else}
					<p class="rounded border border-dashed border-primary p-6 text-center text-secondary">
						Valitse valmis pohja yltä tai lisää ainesosia hakemalla Alkon tuotteita.
					</p>
				{/if}
			</section>

			<section aria-labelledby="punch-serving-title" class={card}>
				<h2 id="punch-serving-title" class="text-lg font-bold">Tarjoilu</h2>
				<fieldset class="flex flex-col gap-1.5">
					<legend class="mb-1.5 text-sm">Lasin koko</legend>
					<div class="flex flex-wrap items-center gap-1.5">
						{#each GLASS_SIZES as size (size)}
							<button
								type="button"
								class={chip(Math.abs(punchDraft.glass - size) < 1e-9)}
								aria-pressed={Math.abs(punchDraft.glass - size) < 1e-9}
								onclick={() => (punchDraft.glass = size)}
							>
								{formatValue(size * 10, undefined)} dl
							</button>
						{/each}
						<label class="flex items-center gap-1.5 text-sm" for="punch-glass">
							<input
								id="punch-glass"
								class={twMerge(components.input(), 'w-16')}
								type="number"
								inputmode="decimal"
								min="0.1"
								max="20"
								step="any"
								value={Math.round(punchDraft.glass * 1000) / 100}
								onchange={updateGlass}
							/>
							dl
						</label>
					</div>
				</fieldset>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="flex flex-col gap-1">
						<label class="text-sm" for="punch-people">Juojia</label>
						<div class="flex flex-row">
							<button
								type="button"
								class={twMerge(
									components.button(),
									'touch-manipulation rounded-e-none border-e-0',
									punchDraft.people <= 1 && 'cursor-not-allowed opacity-50'
								)}
								onclick={() => stepPeople(-1)}
								disabled={punchDraft.people <= 1}
								aria-label="Vähemmän juojia"
							>
								<Icon name="minus" />
							</button>
							<input
								id="punch-people"
								class={twMerge(
									components.input(),
									'hide-number-input w-[6ch] rounded-none text-center'
								)}
								type="number"
								inputmode="numeric"
								min="1"
								max="500"
								step="1"
								bind:value={punchDraft.people}
							/>
							<button
								type="button"
								class={twMerge(components.button(), 'touch-manipulation rounded-s-none border-s-0')}
								onclick={() => stepPeople(1)}
								aria-label="Enemmän juojia"
							>
								<Icon name="plus" />
							</button>
						</div>
					</div>
					<div class="flex flex-col gap-1">
						<label class="text-sm" for="punch-target">Tavoitevahvuus (%)</label>
						<input
							id="punch-target"
							class={twMerge(components.input(), 'w-full')}
							type="number"
							inputmode="decimal"
							min="0.1"
							max="99"
							step="any"
							placeholder="Esim. 6"
							bind:value={target}
							aria-describedby="punch-target-result"
						/>
					</div>
				</div>
				{#if target && hasIngredients}
					<p id="punch-target-result" class="rounded border border-primary bg-primary p-3 text-sm">
						{#if mixerNeeded === null}
							Anna tavoite väliltä 0–100 %.
						{:else if mixerNeeded === 0}
							Booli on jo enintään {formatValue(target, AllColumns.AlcoholPercentage)}. Lisää
							vahvempaa juomaa, jos haluat siitä vahvemman.
						{:else}
							Lisää <strong
								>{formatValue(mixerNeeded, undefined, {
									numberFormatOptions: { maximumFractionDigits: 2 }
								})} l</strong
							>
							alkoholitonta juomaa, niin booli on {formatValue(
								target,
								AllColumns.AlcoholPercentage
							)}
							ja sitä on {formatValue(totals.volume + mixerNeeded, undefined, {
								numberFormatOptions: { maximumFractionDigits: 2 }
							})} l.
						{/if}
					</p>
				{/if}
			</section>
		</div>

		<div
			id="punch-results"
			bind:this={resultsColumn}
			class={twMerge('flex scroll-mt-4 flex-col gap-4', resultsFit && 'lg:sticky lg:top-4')}
		>
			<div class={card}>
				{#if hasIngredients && totals.volume > 0}
					<PunchResults
						{totals}
						{lines}
						{colors}
						glass={punchDraft.glass}
						people={Math.max(1, Math.round(punchDraft.people || 1))}
						{rank}
						hasPersonalInfo={personalInfo.weight != null}
						onopensettings={requestSettingsOpen}
					/>
				{:else}
					<h2 class="text-lg font-bold">Tulokset</h2>
					<p class="text-secondary">Lisää ainesosia nähdäksesi boolin vahvuuden ja hinnan.</p>
				{/if}
			</div>
			{#if hasIngredients}
				<div class="flex flex-wrap gap-2">
					<button type="button" class={twMerge(components.button(), 'flex-1')} onclick={share}>
						<Icon name="share" />
						Jaa resepti
					</button>
					{#if alkoCount}
						<button
							type="button"
							class={twMerge(components.button(), 'flex-1')}
							onclick={toShoppingList}
						>
							<Icon name="list_plus" />
							Tee ostoslista
						</button>
					{/if}
				</div>
			{/if}
			{#if notice}
				<p role="status" class="text-center text-sm text-secondary">{notice}</p>
			{/if}
		</div>
	</div>
</div>
