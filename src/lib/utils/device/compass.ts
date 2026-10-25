export type Point = { latitude: number; longitude: number };

const DIRECTIONS = [
	'pohjoiseen',
	'koilliseen',
	'itään',
	'kaakkoon',
	'etelään',
	'lounaaseen',
	'länteen',
	'luoteeseen'
];

const toRadians = (degrees: number) => degrees * (Math.PI / 180);

/** Initial compass bearing from `from` to `to`, in degrees clockwise from north (0-360). */
export function getBearing(from: Point, to: Point): number {
	const fromLatitude = toRadians(from.latitude);
	const toLatitude = toRadians(to.latitude);
	const longitudeDelta = toRadians(to.longitude - from.longitude);
	const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
	const x =
		Math.cos(fromLatitude) * Math.sin(toLatitude) -
		Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);

	return ((((Math.atan2(y, x) * 180) / Math.PI) % 360) + 360) % 360;
}

/** Finnish direction word (in the "-an" form, e.g. "koilliseen") for a bearing in degrees. */
export function formatDirection(bearing: number): string {
	return DIRECTIONS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
}

/**
 * Returns the angle equivalent to `next` that is closest to `previous`, so a rotation that
 * crosses north (359° → 1°) turns the short way instead of spinning back around.
 */
export function unwrapAngle(previous: number, next: number): number {
	const delta = ((((next - previous) % 360) + 540) % 360) - 180;
	return previous + delta;
}
