<script lang="ts">
	import type { Snippet } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import { foldedSidebars } from '$lib/global.svelte';
	import type { IconName } from '$lib/icons';
	import Icon from './Icon.svelte';

	/**
	 * A page's left sidebar that folds into a narrow strip to give the page more room, remembered
	 * per `id`. The contents stay mounted while folded, so their state and effects (filters keeping
	 * the URL up to date, …) carry on.
	 */
	const {
		id,
		title,
		icon,
		label,
		foldable = true,
		class: _class = '',
		children
	}: {
		id: string;
		/** Shown down the strip while folded, e.g. the page's name */
		title?: string;
		/** Above the title on the strip, the same as the page's in the menu */
		icon?: IconName;
		/** What the sidebar holds, for the fold button, e.g. "suodattimet" */
		label: string;
		/** False where the sidebar isn't one, e.g. when its contents open as a sheet on phones */
		foldable?: boolean;
		class?: string;
		children: Snippet;
	} = $props();

	const folded = $derived(foldable && $foldedSidebars.includes(id));

	function toggle() {
		foldedSidebars.update((ids) => (folded ? ids.filter((other) => other !== id) : [...ids, id]));
	}
</script>

<div class="relative flex h-full max-h-full min-h-0">
	{#if foldable && !folded}
		<!-- On the sidebar's edge, half over the page, so it doesn't take room from the contents -->
		<button
			type="button"
			onclick={toggle}
			aria-expanded="true"
			aria-label={`Piilota ${label}`}
			title={`Piilota ${label}`}
			class="absolute top-3 -right-3 z-20 grid h-6 w-6 cursor-pointer place-content-center rounded-full border border-primary bg-primary text-xs text-secondary shadow-sm hover:bg-secondary hover:text-black dark:hover:text-white"
		>
			<Icon name="chevrons_left" />
		</button>
	{/if}
	<!-- The strip and the sidebar are columns of one grid that trade widths, so folding slides the
	     sidebar out (it's pinned to the right of its column) while the strip slides in -->
	<div
		class="grid h-full max-h-full min-h-0 transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none"
		style:grid-template-columns={folded ? '2.5rem 0fr' : '0rem 1fr'}
	>
		<div class="h-full min-w-0 overflow-hidden" inert={!folded}>
			{#if foldable}
				<div class="flex h-full w-10 flex-col items-center border-e border-primary bg-primary py-3">
					<!-- The title runs down the strip, so it's still clear what's folded away -->
					<button
						type="button"
						onclick={toggle}
						aria-expanded="false"
						aria-label={title ? `${title}: näytä ${label}` : `Näytä ${label}`}
						title={`Näytä ${label}`}
						class="flex max-h-full min-h-0 w-8 cursor-pointer flex-col items-center gap-3 rounded py-1.5 text-secondary hover:bg-secondary hover:text-black dark:hover:text-white"
					>
						<Icon name="chevrons_right" />
						{#if icon}
							<Icon name={icon} class="text-lg text-black dark:text-white" />
						{/if}
						{#if title}
							<span
								class="min-h-0 overflow-hidden font-bold text-ellipsis whitespace-nowrap text-black [writing-mode:vertical-rl] dark:text-white"
							>
								{title}
							</span>
						{/if}
					</button>
				</div>
			{/if}
		</div>
		<div class="flex h-full max-h-full min-h-0 min-w-0 justify-end overflow-hidden" inert={folded}>
			<aside class={twMerge('shrink-0', _class)}>
				{@render children()}
			</aside>
		</div>
	</div>
</div>
