<script lang="ts">
	import { twMerge } from 'tailwind-merge';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { locationDenied, userLocation } from '$lib/global.svelte';
	import type { AvailabilityStore } from '$lib/types';
	import { formatStoreDistance, getStoreDistance } from '$lib/utils/availability';
	import { formatDirection, getBearing, unwrapAngle } from '$lib/utils/compass';
	import { readHeading } from '$lib/utils/orientation';
	import { components } from '$lib/utils/styles';

	let { store, active = true }: { store: AvailabilityStore; active?: boolean } = $props();

	const ARRIVED_KM = 0.04;

	let heading = $state<number | null>(null);
	let needle = $state(0);
	let ring = $state(0);
	let denied = $state(false);

	const destination = $derived(
		typeof store.latitude === 'number' && typeof store.longitude === 'number'
			? { latitude: store.latitude, longitude: store.longitude }
			: null
	);
	const bearing = $derived(
		$userLocation && destination ? getBearing($userLocation, destination) : null
	);
	const distance = $derived(
		$userLocation && destination
			? getStoreDistance({ id: '', name: '', ...$userLocation }, store)
			: null
	);
	const arrived = $derived(distance !== null && distance < ARRIVED_KM);

	// Needle points at the store relative to where the phone is facing; the ring keeps north in place.
	$effect(() => {
		if (bearing !== null) needle = unwrapAngle(needle, bearing - (heading ?? 0));
		ring = unwrapAngle(ring, -(heading ?? 0));
	});

	// Track the heading and position only while the dial is on screen.
	$effect(() => {
		if (!active) return;

		const onOrientation = (event: Event) => {
			const next = readHeading(event);
			if (next !== null) heading = next;
		};
		window.addEventListener('deviceorientationabsolute', onOrientation);
		window.addEventListener('deviceorientation', onOrientation);
		const watchId = navigator.geolocation?.watchPosition(
			({ coords }) => {
				denied = false;
				$userLocation = { latitude: coords.latitude, longitude: coords.longitude };
			},
			(error) => (denied = error.code === error.PERMISSION_DENIED),
			{ enableHighAccuracy: true, maximumAge: 5000 }
		);

		return () => {
			window.removeEventListener('deviceorientationabsolute', onOrientation);
			window.removeEventListener('deviceorientation', onOrientation);
			if (watchId !== undefined) navigator.geolocation?.clearWatch(watchId);
			heading = null;
		};
	});
</script>

<div class="flex flex-col items-center gap-4">
	<div
		class="relative grid h-64 w-64 place-content-center rounded-full border-4 border-primary bg-secondary"
	>
		<div
			class="absolute inset-0 transition-transform duration-300 ease-out"
			style:transform={`rotate(${ring}deg)`}
			aria-hidden="true"
		>
			<span class="absolute top-2 left-1/2 -translate-x-1/2 font-bold text-brand-1">N</span>
			<span class="absolute bottom-2 left-1/2 -translate-x-1/2 text-sm text-secondary">S</span>
			<span class="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-secondary">W</span>
			<span class="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-secondary">E</span>
		</div>
		{#if arrived}
			<span class="text-6xl motion-safe:animate-bounce" role="img" aria-label="Perillä">🍻</span>
		{:else if bearing !== null}
			<div
				class="absolute inset-0 transition-transform duration-300 ease-out"
				style:transform={`rotate(${needle}deg)`}
				aria-hidden="true"
			>
				<div
					class="absolute top-6 left-1/2 h-28 w-3 -translate-x-1/2 rounded-full bg-brand-1 [clip-path:polygon(50%_0,100%_100%,0_100%)]"
				></div>
				<div
					class="absolute top-[8.5rem] left-1/2 h-14 w-3 -translate-x-1/2 rounded-full bg-gray-400 opacity-60 [clip-path:polygon(0_0,100%_0,50%_100%)]"
				></div>
			</div>
		{:else}
			<span class="animate-pulse text-secondary">Haetaan sijaintia…</span>
		{/if}
	</div>

	<div class="text-center" aria-live="polite">
		{#if denied || $locationDenied}
			<p class="text-sm text-red-600">
				Sijaintilupa on estetty. Salli sijainti selaimen asetuksista.
			</p>
		{:else if arrived}
			<p class="text-lg font-bold">Perillä!</p>
			<a
				href="/listat"
				class={twMerge(components.button({ type: 'positive', size: 'md' }), 'mt-2 px-5 py-3')}
			>
				<Icon name="list" />
				<span>Avaa listasi ja tee ostokset!</span>
			</a>
		{:else if distance !== null && bearing !== null}
			<p class="text-2xl font-bold">{formatStoreDistance(distance)}</p>
			<p class="text-secondary">
				Kulje {formatDirection(bearing)}
				{#if heading === null}
					<span class="block text-xs"
						>Kompassin suuntaa ei saatu, nuoli osoittaa pohjoiseen nähden.</span
					>
				{/if}
			</p>
		{/if}
	</div>
</div>
