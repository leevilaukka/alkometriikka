// Checked in order: Chromium-based browsers also carry "Chrome/", and nearly everything carries "Safari/"
const browsers: [name: string, pattern: RegExp][] = [
	['Edge', /\bEdg(?:e|A|iOS)?\/(\d+)/],
	['Opera', /\bOPR\/(\d+)/],
	['Samsung Internet', /\bSamsungBrowser\/(\d+)/],
	['Firefox', /\b(?:Firefox|FxiOS)\/(\d+)/],
	['Chrome', /\b(?:Chrome|CriOS)\/(\d+)/],
	['Safari', /\bVersion\/(\d+(?:\.\d+)?).*\bSafari\//]
];

/**
 * A short browser label such as "Chrome 121" or "Safari 16.6", for grouping error reports.
 * Every iOS browser runs the system WebKit, so iOS also gets the OS version: "Chrome 120 (iOS 16.6)".
 */
export function browserLabel(userAgent: string): string {
	const ios = userAgent.match(/\b(?:iPhone|iPad|iPod).*? OS (\d+)_(\d+)/);
	for (const [name, pattern] of browsers) {
		const match = userAgent.match(pattern);
		if (!match) continue;
		const label = `${name} ${match[1]}`;
		return ios && name !== 'Safari' ? `${label} (iOS ${ios[1]}.${ios[2]})` : label;
	}
	return ios ? `iOS ${ios[1]}.${ios[2]}` : 'unknown';
}
