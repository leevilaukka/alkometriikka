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
		expect(html).toContain("querySelector('[data-prerendered-product]')");
	});

	it('escapes attribute values and keeps $ sequences literal', () => {
		expect(html).toContain('content="Hinta $&amp; 5 € &lt;b&gt;"');
		expect(html).toContain('<h1>Tuote $1</h1>');
	});

	it('cannot be broken out of by JSON-LD content', () => {
		expect(html).not.toContain('</script><b>');
		expect(html).toContain('\\u003c/script>');
	});

	it('omits optional tags when not given', () => {
		expect(html).not.toContain('name="keywords"');
		expect(html).toContain('<meta property="og:type" content="website" />');
		expect(renderStub(template, { ...page, keywords: 'a, b', ogType: 'product' })).toContain(
			'<meta name="keywords" content="a, b" />'
		);
	});
});
