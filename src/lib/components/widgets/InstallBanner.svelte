<script lang="ts">
	import { twMerge } from 'tailwind-merge';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { components } from '$lib/utils/styles';
	import { sendAnalyticsEvent } from '$lib/utils/helpers';
	import { install } from '$lib/utils/pwa.svelte';

	function dismiss() {
		install.dismissBanner();
		sendAnalyticsEvent('dismiss_install_banner');
	}
</script>

<!-- Same look as NoticeBanner, which it sits under -->
{#if install.showBanner}
	<div
		role="status"
		class="flex items-center gap-2 border-b border-primary bg-secondary px-4 py-2 text-sm"
	>
		<Icon name="home_add" class="shrink-0" />
		{#if install.canPrompt}
			<p class="flex-1">
				Asenna Alkometriikka, niin se aukeaa kotinäytöltä ja toimii myös ilman verkkoa.
			</p>
			<button
				class={twMerge(components.button({ type: 'negative' }), 'shrink-0')}
				onclick={() => install.prompt('banner')}
			>
				Asenna
			</button>
		{:else}
			<p class="flex-1">
				Lisää Alkometriikka kotinäytölle: napauta selaimen <span class="whitespace-nowrap"
					><b>Jaa</b>-painiketta</span
				>
				ja valitse
				<b class="whitespace-nowrap">Lisää Koti-valikkoon</b>.
			</p>
		{/if}
		<button
			aria-label="Sulje asennusehdotus"
			class={twMerge(components.button({ type: 'noborder' }), 'shrink-0 p-1 text-current')}
			onclick={dismiss}
		>
			<Icon name="x" />
		</button>
	</div>
{/if}
