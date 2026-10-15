import { describe, expect, it } from 'bun:test';

// Paraglide falls back to Finnish for a message missing from a language, so a message added
// only to fi.json would quietly show in Finnish. These keep the three files in step.
const LANGUAGES = ['fi', 'en', 'sv'] as const;

type Messages = Record<string, unknown>;

async function load(language: string): Promise<Messages> {
	const { $schema, ...messages } = await Bun.file(`messages/${language}.json`).json();
	void $schema;
	return messages;
}

/** The `{placeholders}` a message uses, across every variant of a plural message. */
function placeholders(message: unknown): string[] {
	const text = typeof message === 'string' ? message : JSON.stringify(message);
	return [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
}

describe('messages', async () => {
	const [fi, ...others] = await Promise.all(LANGUAGES.map(load));

	it.each(LANGUAGES.slice(1).map((language, i) => [language, others[i]] as const))(
		'%s has every Finnish message and no others',
		(_, messages) => {
			expect(Object.keys(messages).sort()).toEqual(Object.keys(fi).sort());
		}
	);

	it.each(LANGUAGES.slice(1).map((language, i) => [language, others[i]] as const))(
		'%s uses the same placeholders',
		(_, messages) => {
			const mismatches = Object.keys(fi).filter(
				(key) =>
					JSON.stringify(placeholders(fi[key])) !== JSON.stringify(placeholders(messages[key]))
			);
			expect(mismatches).toEqual([]);
		}
	);

	it.each(LANGUAGES.slice(1).map((language, i) => [language, others[i]] as const))(
		'%s keeps the plural declarations',
		(_, messages) => {
			const declarations = (message: unknown) =>
				Array.isArray(message) ? JSON.stringify(message[0]?.declarations) : null;
			const mismatches = Object.keys(fi).filter(
				(key) => declarations(fi[key]) !== declarations(messages[key])
			);
			expect(mismatches).toEqual([]);
		}
	);
});
