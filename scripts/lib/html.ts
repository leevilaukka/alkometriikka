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

// Collapses whitespace runs to a single space while leaving quoted strings and
// CSS comments untouched (internal whitespace there is significant).
function collapseCssWhitespace(css: string): string {
	let out = '';
	let mode: 'code' | 'string' | 'comment' = 'code';
	let quote = '';
	let i = 0;
	while (i < css.length) {
		const char = css[i];
		if (mode === 'comment') {
			out += char;
			i += 1;
			if (char === '*' && css[i] === '/') {
				out += '/';
				i += 1;
				mode = 'code';
			}
			continue;
		}
		if (mode === 'string') {
			out += char;
			i += 1;
			if (char === quote) {
				mode = 'code';
			} else if (char === '\\') {
				out += css[i] ?? '';
				i += 1;
			}
			continue;
		}
		if (char === '"' || char === "'") {
			mode = 'string';
			quote = char;
			out += char;
			i += 1;
			continue;
		}
		if (char === '/' && css[i + 1] === '*') {
			mode = 'comment';
			out += '/*';
			i += 2;
			continue;
		}
		if (/[ \t\r\n]/.test(char)) {
			while (i < css.length && /[ \t\r\n]/.test(css[i])) i += 1;
			out += ' ';
			continue;
		}
		out += char;
		i += 1;
	}
	return out;
}

// Collapses whitespace runs between attributes to a single space, keeping
// quoted attribute values untouched.
function collapseTagWhitespace(tag: string): string {
	let out = '';
	let quote = '';
	for (let i = 0; i < tag.length; i += 1) {
		const char = tag[i];
		if (quote) {
			out += char;
			if (char === quote) quote = '';
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			out += char;
			continue;
		}
		if (/[ \t\r\n]/.test(char)) {
			while (i < tag.length && /[ \t\r\n]/.test(tag[i])) i += 1;
			out += ' ';
			i -= 1;
			continue;
		}
		out += char;
	}
	return out;
}

// Re-serializes JSON without whitespace, leaving the input untouched if it
// doesn't parse.
function compactJson(json: string): string {
	try {
		return escapeJson(JSON.parse(json));
	} catch {
		return json;
	}
}

const scriptTranspiler = new Bun.Transpiler({ loader: 'js', minifyWhitespace: true });

// Strips whitespace from inline JavaScript and JSON-LD. Other script types are
// returned untouched, as is anything that fails to parse.
function minifyScript(tag: string, content: string): string {
	const type = (/\stype\s*=\s*["']?([^"'\s>]+)/i.exec(tag) || [])[1]?.toLowerCase();
	if (type === 'application/ld+json') return compactJson(content);
	if (type && type !== 'module' && type !== 'text/javascript') return content;
	if (!content.trim()) return content;
	try {
		return scriptTranspiler.transformSync(content);
	} catch {
		return content;
	}
}

// Whitespace-collapsing HTML minifier. Runs of whitespace between tags and
// between attributes become a single space (quoted values and text content are
// preserved). The text content of pre/textarea elements is kept byte-for-byte
// untouched; inline scripts and JSON-LD have their whitespace stripped and
// style content is collapsed as CSS. Comments are left in place.
export function minifyHtml(html: string): string {
	const preserved = new Set(['script', 'style', 'pre', 'textarea']);
	let result = '';
	let position = 0;
	while (position < html.length) {
		if (html.startsWith('<!--', position)) {
			const end = html.indexOf('-->', position + 4);
			position = end === -1 ? html.length : end + 3;
			continue;
		}
		if (html[position] === '<') {
			const end = html.indexOf('>', position);
			if (end === -1) {
				result += html.slice(position);
				break;
			}
			const tag = html.slice(position, end + 1);
			const name = (/^<\s*([a-zA-Z0-9]+)/.exec(tag) || [])[1]?.toLowerCase();
			result += collapseTagWhitespace(tag);
			position = end + 1;
			if (name && preserved.has(name)) {
				const closing = html.indexOf(`</${name}`, position);
				if (closing === -1) {
					result += html.slice(position);
					break;
				}
				const content = html.slice(position, closing);
				result +=
					name === 'style'
						? collapseCssWhitespace(content)
						: name === 'script'
							? minifyScript(tag, content)
							: content;
				position = closing;
			}
			continue;
		}
		const next = html.indexOf('<', position);
		const text = html.slice(position, next === -1 ? html.length : next);
		result += text.replace(/[ \t\r\n]+/g, ' ');
		position = next === -1 ? html.length : next;
	}
	return result;
}
