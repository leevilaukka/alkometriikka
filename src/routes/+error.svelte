<script lang="ts">
	import { generateTitle } from '$lib/utils/helpers';
	import { page } from '$app/state';
	import { twMerge } from 'tailwind-merge';
	import { components } from '$lib/utils/styles';
	import Icon from '$lib/components/widgets/Icon.svelte';

	document.title = generateTitle(`Error ${page.status}`);
	console.error(page.error);
</script>

<div class="grid h-full w-full place-content-center">
	<div class="flex flex-col items-center gap-4">
		<h1 class="text-5xl text-red-600">{page.status}</h1>
		<h2 class="text-xl font-bold">Tapahtui virhe</h2>
		<p>{page.error?.message}</p>
		<a href="/" class={twMerge(components.button({ size: 'md' }))}>
			<Icon name="arrow_left" class="inline-block" />
			<span>Palaa etusivulle</span>
		</a>
	</div>
</div>
