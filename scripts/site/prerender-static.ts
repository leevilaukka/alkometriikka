import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import Bun from "bun";
import { readOption } from "../lib/cli";
import { escapeHtml } from "../lib/html";
import { breadcrumbJsonLd, breadcrumbNav, renderStub, SITE_URL } from "../lib/stub";
import { STATIC_PAGES, storeAddress, storeDescription } from "../../src/lib/utils/seo.ts";
import type { AvailabilityData, StoreData } from "../data/types";

/**
 * Prerenders SEO stubs for the client-rendered routes that have no product
 * data behind them: the plain static pages (laskin, tilastot, …) and one page
 * per Alko store. See scripts/lib/stub.ts for why stubs exist at all.
 *
 * Both sets are tiny (a few hundred files) so they are fully regenerated on
 * every run. Output is deterministic — store opening hours use the regular
 * weekly pattern, not the rolling two-week calendar — so unchanged pages stay
 * byte-identical and add nothing to the gh-pages history.
 */

const OG_IMAGE = `${SITE_URL}/images/og_image.png`;
const OG_IMAGE_ALT = "Alkometriikka logo";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const WEEKDAY_LABELS_FI = ["Sunnuntai", "Maanantai", "Tiistai", "Keskiviikko", "Torstai", "Perjantai", "Lauantai"];

type OpeningHours = { weekday: number; hours: string };

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function pageTitle(name: string): string {
  return `${name} - Alkometriikka`;
}

/** "10–21" / "9.30–20" → ["10:00", "21:00"]; null for "Kiinni" or anything unparseable. */
function parseHours(hours: string): [string, string] | null {
  const match = /^(\d{1,2})(?:[.:](\d{2}))?\s*[–-]\s*(\d{1,2})(?:[.:](\d{2}))?$/.exec(hours.trim());
  if (!match) return null;
  const clock = (hour: string, minutes?: string) => `${hour.padStart(2, "0")}:${minutes ?? "00"}`;
  return [clock(match[1], match[2]), clock(match[3], match[4])];
}

/** The regular weekly hours: the first seven days of Alko's "normal" calendar, ordered Monday → Sunday. */
function weeklyHours(store: StoreData): OpeningHours[] {
  const calendar = Array.isArray(store.openHoursNormal) ? store.openHoursNormal : [];
  const byWeekday = new Map<number, string>();
  for (const entry of calendar.slice(0, 7)) {
    const date = text(entry?.date);
    const hours = text(entry?.hours);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !hours) continue;
    byWeekday.set(new Date(`${date}T12:00:00Z`).getUTCDay(), hours);
  }
  return [1, 2, 3, 4, 5, 6, 0].flatMap((weekday) => {
    const hours = byWeekday.get(weekday);
    return hours ? [{ weekday, hours }] : [];
  });
}

function openingHoursSpecification(hours: OpeningHours[]) {
  const groups = new Map<string, string[]>();
  for (const { weekday, hours: value } of hours) {
    if (!parseHours(value)) continue;
    groups.set(value, [...(groups.get(value) ?? []), WEEKDAYS[weekday]]);
  }
  return [...groups].map(([value, dayOfWeek]) => {
    const [opens, closes] = parseHours(value)!;
    return { "@type": "OpeningHoursSpecification", dayOfWeek, opens, closes };
  });
}

function storeStub(template: string, store: StoreData): string {
  const id = text(store.id);
  const name = text(store.name);
  const url = `${SITE_URL}/myymalat/${encodeURIComponent(id)}/`;
  const title = pageTitle(`Myymälä - ${name}`);
  const input = {
    name,
    address: text(store.address),
    postalCode: text(store.postalCode),
    postOffice: text(store.postOffice),
    city: text(store.city)
  };
  const description = storeDescription(input);
  const hours = weeklyHours(store);
  const latitude = Number(store.latitude);
  const longitude = Number(store.longitude);
  const hasGeo = Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0);
  const specification = openingHoursSpecification(hours);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LiquorStore",
    "@id": url,
    url,
    name: `Alko ${name}`,
    description,
    inLanguage: "fi-FI",
    brand: { "@type": "Brand", name: "Alko", url: "https://www.alko.fi" },
    address: {
      "@type": "PostalAddress",
      ...(input.address ? { streetAddress: input.address } : {}),
      ...(input.postalCode ? { postalCode: input.postalCode } : {}),
      ...(text(store.city) || input.postOffice ? { addressLocality: text(store.city) || input.postOffice } : {}),
      addressCountry: "FI"
    },
    ...(hasGeo ? { geo: { "@type": "GeoCoordinates", latitude, longitude } } : {}),
    ...(specification.length ? { openingHoursSpecification: specification } : {})
  };

  const trail = [{ name: "Myymälät", path: "/myymalat/" }];
  const breadcrumb = breadcrumbJsonLd([
    { name: "Myymälät", url: `${SITE_URL}/myymalat/` },
    { name: `Myymälä - ${name}`, url }
  ]);

  return renderStub(template, {
    title,
    description,
    url,
    keywords: ["Alko", "myymälä", name, input.address, input.postalCode, input.postOffice].filter(Boolean).join(", "),
    ogImage: OG_IMAGE,
    ogImageAlt: OG_IMAGE_ALT,
    jsonLd: [jsonLd, breadcrumb],
    fallbackName: "store",
    fallbackHtml: `\t\t${breadcrumbNav(trail)}
\t\t<h1>${escapeHtml(`Alko ${name}`)}</h1>
\t\t<p>${escapeHtml(storeAddress(input))}</p>
\t\t${
      hours.length
        ? `<dl>${hours
            .map(
              ({ weekday, hours: value }) =>
                `<dt>${escapeHtml(WEEKDAY_LABELS_FI[weekday])}</dt><dd>${escapeHtml(value)}</dd>`
            )
            .join("")}</dl>`
        : ""
    }`
  });
}

function staticStub(template: string, page: (typeof STATIC_PAGES)[number]): string {
  const url = `${SITE_URL}${page.path}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": url,
    url,
    name: page.title,
    description: page.description,
    inLanguage: "fi-FI",
    isPartOf: { "@type": "WebSite", name: "Alkometriikka", url: `${SITE_URL}/` }
  };
  return renderStub(template, {
    title: pageTitle(page.title),
    description: page.description,
    url,
    keywords: page.keywords,
    ogImage: OG_IMAGE,
    ogImageAlt: OG_IMAGE_ALT,
    jsonLd: [jsonLd, breadcrumbJsonLd([{ name: page.title, url }])],
    fallbackName: "page",
    fallbackHtml: `\t\t${breadcrumbNav([])}
\t\t<h1>${escapeHtml(page.title)}</h1>
\t\t<p>${escapeHtml(page.description)}</p>`
  });
}

async function writePage(outputPath: string, route: string, html: string) {
  const directory = path.join(outputPath, ...route.split("/").filter(Boolean));
  await mkdir(directory, { recursive: true });
  await Bun.write(path.join(directory, "index.html"), html);
}

async function main() {
  const outputPath = path.resolve(readOption("--out") ?? "build");
  const templatePath = path.resolve(readOption("--template") ?? path.join(outputPath, "404.html"));
  const availabilityPath = path.resolve(readOption("--availability") ?? path.join(outputPath, "availability.json"));

  const template = await Bun.file(templatePath).text();

  const hasAvailability = await Bun.file(availabilityPath).exists();
  // Reset the store pages first (the /myymalat/ index shares the directory) so
  // stores that closed don't linger on the deployed site.
  if (hasAvailability) await rm(path.join(outputPath, "myymalat"), { recursive: true, force: true });

  for (const page of STATIC_PAGES) {
    await writePage(outputPath, page.path, staticStub(template, page));
  }

  let stores = 0;
  if (hasAvailability) {
    const availability = (await Bun.file(availabilityPath).json()) as AvailabilityData;
    for (const store of Object.values(availability.stores ?? {})) {
      const id = text(store?.id);
      if (!/^[A-Za-z0-9_-]+$/.test(id) || !text(store.name)) continue;
      await writePage(outputPath, `/myymalat/${id}/`, storeStub(template, store));
      stores += 1;
    }
  } else {
    console.warn(`⚠️  Availability data not found at ${availabilityPath}; skipping store pages.`);
  }

  console.log(`Static pages: ${STATIC_PAGES.length} | Store pages: ${stores} → ${outputPath}`);
}

await main();
