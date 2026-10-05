<script lang="ts">
	import { onMount } from 'svelte';
	import { twMerge } from 'tailwind-merge';
	import Popup from '$lib/components/widgets/Popup.svelte';
	import Icon from '$lib/components/widgets/Icon.svelte';
	import { userLocation } from '$lib/global.svelte';
	import type { AvailabilityStore } from '$lib/types';
	import { getStoreDistance, formatStoreDistance } from '$lib/utils/availability';
	import { formatDirection, getBearing, unwrapAngle } from '$lib/utils/compass';
	import { sendAnalyticsEvent } from '$lib/utils/helpers';
	import { components } from '$lib/utils/styles';

	let { store }: { store: AvailabilityStore } = $props();

	type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };
	type OrientationPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

	const ARRIVED_KM = 0.04;

	let dialogElement: HTMLDialogElement | undefined = $state();
	let supported = $state(false);
	let heading = $state<number | null>(null);
	let needle = $state(0);
	let ring = $state(0);
	let denied = $state(false);
	let watchId: number | undefined;

	const destination = $derived(
		typeof store.latitude === 'number' && typeof store.longitude === 'number'
			? { latitude: store.latitude, longitude: store.longitude }
			: null
	);
	const bearing = $derived($userLocation && destination ? getBearing($userLocation, destination) : null);
	const distance = $derived(
		$userLocation && destination ? getStoreDistance({ id: '', name: '', ...$userLocation }, store) : null
	);
	const arrived = $derived(distance !== null && distance < ARRIVED_KM);

	// Needle points at the store relative to where the phone is facing; the ring keeps north in place.
	$effect(() => {
		if (bearing !== null) needle = unwrapAngle(needle, bearing - (heading ?? 0));
		ring = unwrapAngle(ring, -(heading ?? 0));
	});

	function readHeading(event: OrientationEventWithCompass) {
		if (typeof event.webkitCompassHeading === 'number') return event.webkitCompassHeading;
		if (event.alpha !== null && (event.absolute || event.type === 'deviceorientationabsolute')) {
			return (360 - event.alpha) % 360;
		}
		return null;
	}

	function onOrientation(event: Event) {
		const next = readHeading(event as OrientationEventWithCompass);
		if (next !== null) heading = next;
	}

	function start() {
		window.addEventListener('deviceorientationabsolute', onOrientation);
		window.addEventListener('deviceorientation', onOrientation);
		watchId = navigator.geolocation?.watchPosition(
			({ coords }) => {
				denied = false;
				$userLocation = { latitude: coords.latitude, longitude: coords.longitude };
			},
			(error) => (denied = error.code === error.PERMISSION_DENIED),
			{ enableHighAccuracy: true, maximumAge: 5000 }
		);
	}

	function stop() {
		window.removeEventListener('deviceorientationabsolute', onOrientation);
		window.removeEventListener('deviceorientation', onOrientation);
		if (watchId !== undefined) navigator.geolocation?.clearWatch(watchId);
		watchId = undefined;
		heading = null;
	}

	async function open(dialog: HTMLDialogElement) {
		// iOS only allows the orientation permission prompt from a tap, so ask before opening.
		const permission = (DeviceOrientationEvent as unknown as OrientationPermission).requestPermission;
		if (permission) await permission().catch(() => 'denied');
		dialog.showModal();
		sendAnalyticsEvent('store_compass_opened', { storeId: store.id, storeName: store.name });
	}

	// Only offer the compass on touch devices that actually report a heading.
	onMount(() => {
		if (!destination || !window.matchMedia('(pointer: coarse)').matches) return;
		if (!('DeviceOrientationEvent' in window)) return;

		// iOS reveals sensor data only after the permission prompt, so trust it to be there.
		if ((DeviceOrientationEvent as unknown as OrientationPermission).requestPermission) {
			supported = true;
			return;
		}

		const probe = (event: Event) => {
			if (readHeading(event as OrientationEventWithCompass) !== null) supported = true;
			done();
		};
		const done = () => {
			clearTimeout(timer);
			window.removeEventListener('deviceorientationabsolute', probe);
			window.removeEventListener('deviceorientation', probe);
		};
		const timer = setTimeout(done, 1500);
		window.addEventListener('deviceorientationabsolute', probe);
		window.addEventListener('deviceorientation', probe);
		return done;
	});
</script>

{#if supported}
	<Popup
		bind:dialogElement
		class="w-[min(40ch,100%)] gap-4 p-4"
		onOpen={start}
		onClose={stop}
	>
		{#snippet renderButton(dialogElement: HTMLDialogElement)}
			<button
				type="button"
				class={twMerge(components.button({ size: 'md' }), 'w-full px-5 py-3 text-xl')}
				onclick={() => open(dialogElement)}
			>
				<Icon name="compass" />
				<span>Kompassi</span>
			</button>
		{/snippet}
		{#snippet renderContent(dialogElement: HTMLDialogElement)}
			<div class="flex flex-col items-center gap-4">
				<div class="flex w-full items-center justify-between gap-4">
					<h2 class="text-lg font-bold">Kompassi: {store.name}</h2>
					<button
						onclick={() => dialogElement?.close()}
						aria-label="Sulje"
						class={twMerge(components.button({ type: 'noborder' }))}
					>
						<Icon name="x" />
					</button>
				</div>

				<div class="relative grid h-64 w-64 place-content-center rounded-full border-4 border-primary bg-secondary">
					<div
						class="absolute inset-0 transition-transform duration-300 ease-out"
						style:transform={`rotate(${ring}deg)`}
						aria-hidden="true"
					>
						<span class="absolute left-1/2 top-2 -translate-x-1/2 font-bold text-brand-1">N</span>
						<span class="absolute bottom-2 left-1/2 -translate-x-1/2 text-sm text-secondary">S</span>
						<span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-secondary">W</span>
						<span class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-secondary">E</span>
					</div>
					{#if arrived}
						<span class="text-6xl motion-safe:animate-bounce" role="img" aria-label="Perillä">🍻</span>
					{:else if bearing !== null}
						<div
							class="absolute inset-0 transition-transform duration-300 ease-out"
							style:transform={`rotate(${needle}deg)`}
							aria-hidden="true"
						>
							<div class="absolute left-1/2 top-6 h-28 w-3 -translate-x-1/2 rounded-full bg-brand-1 [clip-path:polygon(50%_0,100%_100%,0_100%)]"></div>
							<div class="absolute left-1/2 top-[8.5rem] h-14 w-3 -translate-x-1/2 rounded-full bg-gray-400 opacity-60 [clip-path:polygon(0_0,100%_0,50%_100%)]"></div>
						</div>
					{:else}
						<span class="animate-pulse text-secondary">Haetaan sijaintia…</span>
					{/if}
				</div>

				<div class="text-center" aria-live="polite">
					{#if denied}
						<p class="text-sm text-red-600">Sijaintilupa on estetty. Salli sijainti selaimen asetuksista.</p>
					{:else if arrived}
						<p class="text-lg font-bold">Perillä!</p>
						<a
							href="/listat"
							class={twMerge(components.button({ type: 'positive', size: 'md' }), 'mt-2 px-5 py-3')}
						>
							<Icon name="list" />
							<span>Tarkista ostoslistasi!</span>
						</a>
					{:else if distance !== null && bearing !== null}
						<p class="text-2xl font-bold">{formatStoreDistance(distance)}</p>
						<p class="text-secondary">
							Kulje {formatDirection(bearing)}
							{#if heading === null}
								<span class="block text-xs">Kompassin suuntaa ei saatu, nuoli osoittaa pohjoiseen nähden.</span>
							{/if}
						</p>
					{/if}
				</div>
			</div>
		{/snippet}
	</Popup>
{/if}
