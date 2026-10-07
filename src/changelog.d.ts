declare module 'virtual:changelog' {
	/** CHANGELOG.md rendered to HTML at build time (see vite.config.ts) */
	const html: string;
	export default html;
}
