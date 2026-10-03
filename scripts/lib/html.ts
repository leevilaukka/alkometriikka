const SEO_START = '<!-- Dynamic SEO data start -->';
const SEO_END = '<!-- Dynamic SEO data end -->';

export function escapeHtml(value: unknown): string {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/** JSON safe to embed inside a `<script>` tag. */
export function escapeJson(value: unknown): string {
	return JSON.stringify(value).replaceAll('<', '\\u003c');
}

/** Replaces the content between the dynamic SEO markers of an HTML template. */
export function replaceMarkedSection(template: string, content: string): string {
	const start = template.indexOf(SEO_START);
	const end = template.indexOf(SEO_END, start);
	if (start === -1 || end === -1) {
		throw new Error('SEO markers are missing from the template');
	}
	return `${template.slice(0, start)}${SEO_START}\n${content}\n\t${template.slice(end)}`;
}
