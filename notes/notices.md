# Site notices

Banners under the header, for telling users something without changing app code
([`NoticeBanner.svelte`](../src/lib/components/widgets/NoticeBanner.svelte),
logic in [`notices.ts`](../src/lib/utils/app/notices.ts)).

## Automatic stale-data warning

Shown when the dataset's `LastSynced` is over 24 h old (the sync runs every 6 h,
so a few runs have failed). Needs no action. Dismissing it lasts until the next
sync changes `LastSynced`.

## Posting a notice

Edit [`static/notices.json`](../static/notices.json) on `main` (the GitHub web
editor is fine). The push deploys it and `build.yml` purges it from Cloudflare.

The file points at [`schemas/notices.schema.json`](../schemas/notices.schema.json)
through its `$schema` key, so VS Code and JetBrains autocomplete the fields and
flag typos, bad dates and unsafe links. `bun test` also fails if an entry in the
file would be dropped by the parser.

```json
{
	"notices": [
		{
			"id": "alko-api-2026-10",
			"level": "warning",
			"message": "Alkon rajapinta muuttui, eikä hintoja saada päivitettyä. Korjaus on työn alla.",
			"link": {
				"href": "https://github.com/leevilaukka/alkometriikka/issues/123",
				"label": "Lisätietoja"
			},
			"expiresAt": "2026-10-20T00:00:00Z",
			"replacesStaleWarning": true
		}
	]
}
```

| Field                  | Default | Notes                                                                         |
| ---------------------- | ------- | ----------------------------------------------------------------------------- |
| `id`                   | —       | Required. Dismissals are stored per id; use a new id to show it again.        |
| `message`              | —       | Required. Plain text.                                                         |
| `level`                | `info`  | `info` or `warning`.                                                          |
| `link`                 | —       | `{ href, label }`. `href` must start with `/` or `https://`.                  |
| `startsAt`/`expiresAt` | —       | ISO timestamps. Expired notices disappear on their own.                       |
| `dismissible`          | `true`  | `false` keeps the notice up.                                                  |
| `replacesStaleWarning` | `false` | Hides the automatic stale warning while active, to explain an outage instead. |
| `urlParams`            | —       | Only shown to visitors who landed with these query params. See below.         |

Malformed entries are skipped, and a missing or broken file just shows no notices.

## Notices for a specific link

`urlParams` aims a notice at people arriving through a particular link, such as
a welcome for a group you share `https://alkometriikka.fi/?utm_source=kilta&utm_campaign=fuksit`
with:

```json
{
	"id": "welcome-fuksit-2026",
	"message": "Tervetuloa fuksit! Hauska nähdä teitä täällä.",
	"urlParams": { "utm_campaign": "fuksit" },
	"expiresAt": "2026-12-31T00:00:00Z"
}
```

Every key must be present in the URL, and a list (`{ "utm_source": ["kilta", "discord"] }`)
accepts any of its values. Values are matched case-insensitively. Any query param
works, not just `utm_*`.

The params the visitor landed with are remembered for the browser session, so the
notice stays up as they move around the site until they dismiss it. A malformed
`urlParams` drops the notice rather than showing it to everyone.
