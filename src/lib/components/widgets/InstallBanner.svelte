<script lang="ts">
	import { twMerge } from 'tailwind-merge';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { components } from '$lib/utils/ui/styles';
	import { sendAnalyticsEvent } from '$lib/utils/app/analytics';
	import { install } from '$lib/utils/app/pwa.svelte';
	import { m } from '$lib/i18n';

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
			<p class="flex-1">{m.install_banner_prompt()}</p>
			<button
				class={twMerge(components.button({ type: 'negative' }), 'shrink-0')}
				onclick={() => install.prompt('banner')}
			>
				{m.install_button()}
			</button>
		{:else}
			<p class="flex-1">
				{m.install_banner_ios_intro()}
				{m.install_ios_steps_before().toLocaleLowerCase()}
				<b class="whitespace-nowrap">{m.install_ios_share_button()}</b>
				{m.install_ios_steps_middle()}
				<b class="whitespace-nowrap">{m.install_ios_add_to_home()}</b>{m.install_ios_steps_after()}
			</p>
		{/if}
		<button
			aria-label={m.install_banner_close()}
			class={twMerge(components.button({ type: 'noborder' }), 'shrink-0 p-1 text-current')}
			onclick={dismiss}
		>
			<Icon name="x" />
		</button>
	</div>
{/if}
