type OrientationEventWithCompass = DeviceOrientationEvent & { webkitCompassHeading?: number };
type OrientationPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

const permissionApi = () =>
	typeof DeviceOrientationEvent === 'undefined'
		? undefined
		: (DeviceOrientationEvent as unknown as OrientationPermission).requestPermission;

/** Compass heading in degrees clockwise from north, or null if the event has no absolute heading. */
export function readHeading(event: Event): number | null {
	const { webkitCompassHeading, alpha, absolute, type } = event as OrientationEventWithCompass;
	if (typeof webkitCompassHeading === 'number') return webkitCompassHeading;
	if (alpha !== null && alpha !== undefined && (absolute || type === 'deviceorientationabsolute')) {
		return (360 - alpha) % 360;
	}
	return null;
}

/** True on iOS, where sensor data is only released after a permission prompt from a tap. */
export const needsOrientationPermission = () => Boolean(permissionApi());

/** Asks for motion access where required (must be called from a tap). Resolves true if allowed. */
export async function requestOrientationPermission(): Promise<boolean> {
	const request = permissionApi();
	if (!request) return true;
	return (await request.call(DeviceOrientationEvent).catch(() => 'denied')) === 'granted';
}

/** Whether this is a touch device that reports a compass heading. */
export function detectCompass(timeout = 1500): Promise<boolean> {
	if (typeof window === 'undefined' || !window.matchMedia('(pointer: coarse)').matches) {
		return Promise.resolve(false);
	}
	if (!('DeviceOrientationEvent' in window)) return Promise.resolve(false);
	// iOS reveals sensor data only after the permission prompt, so trust it to be there.
	if (needsOrientationPermission()) return Promise.resolve(true);

	return new Promise((resolve) => {
		const finish = (result: boolean) => {
			clearTimeout(timer);
			window.removeEventListener('deviceorientationabsolute', probe);
			window.removeEventListener('deviceorientation', probe);
			resolve(result);
		};
		const probe = (event: Event) => {
			if (readHeading(event) !== null) finish(true);
		};
		const timer = setTimeout(() => finish(false), timeout);
		window.addEventListener('deviceorientationabsolute', probe);
		window.addEventListener('deviceorientation', probe);
	});
}
