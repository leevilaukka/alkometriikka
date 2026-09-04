<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Kaljakori } from '$lib/alko';
	import { customTemplates, preferredStoreId } from '$lib/global.svelte';
	import type { AvailabilityData } from '$lib/types';
	import { AllColumns } from '$lib/utils/constants';
	import { formatValue } from '$lib/utils/format';
	import { sendAnalyticsEvent } from '$lib/utils/helpers';
	import { listToURI } from '$lib/utils/lists';
	import { components } from '$lib/utils/styles';
	import {
		createListFromTemplate,
		customTemplateToListTemplate,
		listTemplates,
		rerollSlotItem,
		resolveTemplate,
		type ListTemplate,
		type SlotResolution,
		type TemplateOptions
	} from '$lib/utils/templates';
	import { twMerge } from 'tailwind-merge';
	import Icon from './Icon.svelte';
	import ListBuilder from './ListBuilder.svelte';
	import Popup from './Popup.svelte';

	const { kaljakori, availability }: { kaljakori: Kaljakori; availability: AvailabilityData } =
		$props();

	const unfilledReasonTexts = { 'no-matches': 'ei sopivia tuotteita', budget: 'budjetti tuli vastaan' };

	type View = 'templates' | 'builder' | 'preview';
	let view = $state<View>('templates');
	let selectedTemplate = $state<ListTemplate | null>(null);
	let resolutionSlots = $state<SlotResolution[]>([]);

	let options: TemplateOptions = $derived.by(() => {
		const storeName = $preferredStoreId ? availability.stores[$preferredStoreId]?.name : undefined;
		return { storeName };
	});

	function handleSelectTemplate(template: ListTemplate) {
		selectedTemplate = template;
		resolutionSlots = resolveTemplate(template, kaljakori, options).slots;
		view = 'preview';
	}

	function handleBack() {
		selectedTemplate = null;
		view = 'templates';
	}

	function handleOpenBuilder() {
		selectedTemplate = null;
		view = 'builder';
	}

	function handleSelectCustomTemplate(id: string) {
		const custom = customTemplates.find((t) => t.id === id);
		if (!custom) return;
		handleSelectTemplate(customTemplateToListTemplate(custom));
	}

	function handleDeleteCustomTemplate(id: string) {
		const index = customTemplates.findIndex((t) => t.id === id);
		if (index >= 0) customTemplates.splice(index, 1);
	}

	function handleRerollItem(slotIndex: number, itemIndex: number) {
		if (!selectedTemplate) return;
		const template = selectedTemplate;
		const slotResolution = resolutionSlots[slotIndex];
		const oldItem = slotResolution.picked[itemIndex];

		// Everything else currently picked (all slots, except the item being
		// re-rolled) is excluded so the replacement can't duplicate it.
		const exclude = new Set<string>();
		resolutionSlots.forEach((sr, si) => {
			sr.picked.forEach((item, ii) => {
				if (si === slotIndex && ii === itemIndex) return;
				exclude.add(item[AllColumns.Number]);
			});
		});
		// Budget the replacement can spend: template budget minus everything kept.
		const othersTotal =
			totalPrice() - (Number(oldItem[AllColumns.Price]) || 0);

		const fresh = rerollSlotItem(template.slots[slotIndex], kaljakori, {
			...options,
			exclude,
			budget: template.budget,
			spent: othersTotal
		});
		// Prefer a product that isn't the one being re-rolled, when possible.
		const replacement =
			fresh.picked.find((item) => item[AllColumns.Number] !== oldItem[AllColumns.Number]) ??
			fresh.picked[0];
		if (!replacement) return; // nothing better available; keep the current pick

		resolutionSlots = resolutionSlots.map((sr, si) =>
			si === slotIndex
				? { ...sr, picked: sr.picked.map((p, pi) => (pi === itemIndex ? replacement : p)) }
				: sr
		);
	}

	function handleCreateList(dialogElement: HTMLDialogElement) {
		if (!selectedTemplate) return;
		const { list } = createListFromTemplate(selectedTemplate, kaljakori, options);
		sendAnalyticsEvent('create_list_from_template', { template: selectedTemplate.id });
		const missing = resolutionSlots.filter(({ slot, picked }) => picked.length < slot.quantity);
		if (missing.length > 0) {
			alert(
				`Lista "${list.name}" luotiin, mutta kaikkia osioita ei voitu täyttää:\n` +
					missing
						.map(
							({ slot, picked, reason }) =>
								`- ${slot.label}: ${picked.length}/${slot.quantity}` +
								(reason ? ` (${unfilledReasonTexts[reason]})` : '')
						)
						.join('\n')
			);
		}
		dialogElement.close();
		selectedTemplate = null;
		goto(`/listat?list=${listToURI(list)}`);
	}

	function totalPrice(): number {
		return resolutionSlots.reduce(
			(sum, slotResolution) =>
				sum +
				slotResolution.picked.reduce(
					(slotSum, item) => slotSum + (Number(item[AllColumns.Price]) || 0),
					0
				),
			0
		);
	}
</script>

<Popup class="gap-4 p-4">
	{#snippet renderButton(dialogElement: HTMLDialogElement)}
		<button
			class={twMerge(components.button({ type: 'primary', size: 'md' }), 'w-full justify-center')}
			onclick={() => {
				selectedTemplate = null;
				view = 'templates';
				dialogElement.showModal();
			}}
		>
			<Icon name="magic_wand" />
			<span>Älykkäät listat</span>
		</button>
	{/snippet}
	{#snippet renderContent(dialogElement: HTMLDialogElement)}
		{#if view === 'builder'}
			<div class="max-h-[80vh] overflow-y-auto pr-1">
				<ListBuilder
					{kaljakori}
					{availability}
					onCancel={handleBack}
					onCreated={(uri) => {
						dialogElement.close();
						goto(`/listat?list=${uri}`);
					}}
				/>
			</div>
		{:else if view === 'templates'}
			<div class="flex flex-col gap-3">
				<div class="flex items-start justify-between gap-2">
					<h2 class="flex items-center gap-2 text-xl font-semibold">
						<Icon name="magic_wand" /> Älykkäät listat
					</h2>
					<button
						class={twMerge(components.button({ type: 'noborder', size: 'sm' }), 'shrink-0')}
						onclick={() => dialogElement.close()}
						aria-label="Sulje"
					>
						<Icon name="x" />
					</button>
				</div>
				<p class="text-sm text-secondary">
					Luo valmis lista teeman mukaan – voit muokata sitä vapaasti jälkeenpäin.
				</p>
				<div class="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
					{#each listTemplates as template (template.id)}
						<button
							class={twMerge(
								components.button({ type: 'primary' }),
								'w-full items-start justify-start gap-3 p-3 text-left'
							)}
							onclick={() => handleSelectTemplate(template)}
						>
							<Icon name={template.icon} class="mt-0.5 shrink-0" />
							<span class="flex flex-col gap-0.5">
								<span class="font-semibold">{template.name}</span>
								<span class="text-sm font-normal text-secondary">{template.description}</span>
							</span>
						</button>
					{/each}
				</div>

				{#if customTemplates.length > 0}
					<div class="mt-2 flex flex-col gap-2">
						<h3 class="text-sm font-semibold text-secondary">Omat mallit</h3>
						<div class="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
							{#each customTemplates as template (template.id)}
								<div class="flex items-stretch gap-1">
									<button
										class={twMerge(
											components.button({ type: 'primary' }),
											'flex-1 items-start justify-start gap-3 p-3 text-left'
										)}
										onclick={() => handleSelectCustomTemplate(template.id)}
									>
										<Icon name={template.icon} class="mt-0.5 shrink-0" />
										<span class="flex flex-col gap-0.5">
											<span class="font-semibold">{template.name}</span>
											{#if template.description}
												<span class="text-sm font-normal text-secondary">{template.description}</span>
											{/if}
										</span>
									</button>
									<button
										class={twMerge(components.button({ type: 'negative', size: 'sm' }), 'aspect-square self-center')}
										onclick={() => handleDeleteCustomTemplate(template.id)}
										aria-label={`Poista malli ${template.name}`}
									>
										<Icon name="trash" />
									</button>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<button
					class={twMerge(components.button({ type: 'positive', size: 'md' }), 'w-full justify-center gap-2')}
					onclick={handleOpenBuilder}
				>
					<Icon name="pencil_sparkles" /> Luo oma lista
				</button>
			</div>
		{:else if selectedTemplate}
			<div class="flex flex-col gap-4">
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-2">
						<button
							class={twMerge(components.button({ type: 'noborder', size: 'sm' }), 'shrink-0')}
							onclick={handleBack}
							aria-label="Takaisin"
						>
							<Icon name="arrow_back" />
						</button>
						<h2 class="flex items-center gap-2 text-xl font-semibold">
							<Icon name={selectedTemplate.icon} /> {selectedTemplate.name}
						</h2>
					</div>
					<span class="text-lg font-semibold">{formatValue(totalPrice(), AllColumns.Price)}</span>
				</div>

				<div class="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
					{#each resolutionSlots as slotResolution, i (slotResolution.slot.label)}
						<div class="flex flex-col gap-1">
							<p class="text-sm font-semibold">
								{slotResolution.slot.label}
								<span class="font-normal text-secondary">
									({slotResolution.picked.length}/{slotResolution.slot.quantity})
								</span>
							</p>
							{#if slotResolution.picked.length === 0}
								<p class="text-sm text-secondary italic">
									Ei tuotteita{slotResolution.reason
										? ` (${unfilledReasonTexts[slotResolution.reason]})`
										: ''}
								</p>
							{:else}
								<ul class="flex flex-col gap-1">
									{#each slotResolution.picked as item, itemIndex (item[AllColumns.Number])}
										<li
											class="flex items-center justify-between gap-2 rounded border border-primary px-2 py-1"
										>
											<span class="min-w-0 flex-1 truncate text-sm">{item[AllColumns.Name]}</span>
											<span class="shrink-0 text-sm font-medium">
												{formatValue(item[AllColumns.Price], AllColumns.Price)}
											</span>
											<button
												class={twMerge(components.button({ type: 'noborder', size: 'xs' }), 'shrink-0 px-1')}
												onclick={() => handleRerollItem(i, itemIndex)}
												title="Arvo uudelleen"
												aria-label={`Arvo "${item[AllColumns.Name]}" uudelleen`}
											>
												<Icon name="refresh" />
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/each}
				</div>

				<button
					class={twMerge(components.button({ type: 'positive', size: 'md' }), 'w-full justify-center')}
					onclick={() => handleCreateList(dialogElement)}
				>
					<Icon name="plus" /> Luo lista
				</button>
			</div>
		{/if}
	{/snippet}
</Popup>
