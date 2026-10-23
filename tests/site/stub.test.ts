import { describe, expect, it } from 'bun:test';
import { renderStub } from '../../scripts/lib/stub';

const template = `<!doctype html><html><head>
	<!-- Dynamic SEO data start -->
	<meta name="description" content="old" />
	<!-- Dynamic SEO data end -->
	<title>Alkometriikka</title>
</head><body class="x"><div id="app"></div></body></html>`;

const page = {
	title: 'Tuote "A" - Alkometriikka',
	description: 'Hinta $& 5 € <b>',
	url: 'https://alkometriikka.fi/tuotteet/1/',
	ogImage: 'https://cdn.example/og.png',
	ogImageAlt: 'Tuote',
	jsonLd: [{ '@type': 'Thing', name: '</script><b>' }],
	fallbackName: 'product',
	fallbackHtml: '<h1>Tuote $1</h1>'
};

describe('renderStub', () => {
	const html = renderStub(template, page);

	it('replaces the SEO section, title and body fallback', () => {
		expect(html).not.toContain('content="old"');
		expect(html).toContain('<title>Tuote &quot;A&quot; - Alkometriikka</title>');
		expect(html).toContain('<link rel="canonical" href="https://alkometriikka.fi/tuotteet/1/" />');
		expect(html).toContain('<body class="x"> <article data-prerendered-product');
		expect(html).toContain('querySelector("[data-prerendered-product]")');
	});

	it('escapes attribute values and keeps $ sequences literal', () => {
		expect(html).toContain('content="Hinta $&amp; 5 € &lt;b&gt;"');
		expect(html).toContain('<h1>Tuote $1</h1>');
	});

	it('cannot be broken out of by JSON-LD content', () => {
		expect(html).not.toContain('</script><b>');
		expect(html).toContain('\\u003c/script>');
	});

	it('compacts JSON-LD from the template', () => {
		const withLd = template.replace(
			'<title>',
			`<script type="application/ld+json">
		{
			"@type": "WebSite",
			"name": "Alko <b>"
		}
	</script><script type="text/template">  keep  </script><title>`
		);
		const out = renderStub(withLd, page);
		expect(out).toContain(
			'<script type="application/ld+json">{"@type":"WebSite","name":"Alko \\u003cb>"}</script>'
		);
		expect(out).toContain('<script type="text/template">  keep  </script>');
	});

	it('strips whitespace from inline scripts', () => {
		const withScript = template.replace(
			'<title>',
			`<script>
		const name = 'a  b';
		start(name);
	</script><title>`
		);
		expect(renderStub(withScript, page)).toContain(
			`<script>const name="a  b";start(name);</script>`
		);
	});

	it('leaves twitter fields to the og: tags', () => {
		expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
		expect(html).not.toContain('twitter:title');
	});

	it("preloads the route's code the shell doesn't already load, under its base path", () => {
		const shell = template.replace(
			'<title>',
			`<link href="/base/_app/immutable/entry/start.a.js" rel="modulepreload">
	<link href="/base/_app/immutable/chunks/shared.js" rel="modulepreload">
	<link href="/base/_app/immutable/assets/0.css" rel="stylesheet"><title>`
		);
		const out = renderStub(shell, {
			...page,
			route: {
				imports: ['_app/immutable/nodes/19.b.js', '_app/immutable/chunks/shared.js'],
				stylesheets: ['_app/immutable/assets/0.css', '_app/immutable/assets/19.css']
			}
		});
		expect(out).toContain('<link rel="modulepreload" href="/base/_app/immutable/nodes/19.b.js" />');
		expect(out).toContain(
			'<link rel="preload" as="style" href="/base/_app/immutable/assets/19.css" />'
		);
		expect(out.match(/chunks\/shared\.js/g)).toHaveLength(1);
		expect(out.match(/assets\/0\.css/g)).toHaveLength(1);
		expect(html).not.toContain('rel="modulepreload"');
	});

	it('omits optional tags when not given', () => {
		expect(html).not.toContain('name="keywords"');
		expect(html).toContain('<meta property="og:type" content="website" />');
		expect(renderStub(template, { ...page, keywords: 'a, b', ogType: 'product' })).toContain(
			'<meta name="keywords" content="a, b" />'
		);
	});
});
