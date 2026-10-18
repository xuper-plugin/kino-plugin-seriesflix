// Seriesflix: series only. /episodio/<slug>-<s>x<e> lists a block of players per language, each a base64 `data-url`.
// The site moved from seriesflixhd.casa / .best to seriesflixhd.pw (the old names redirect), so the new one is asked directly.
import { extractorFor } from "./extractors/index.js";
import { normLang } from "./util/lang.js";
import { slugify } from "./util/slug.js";

export const SITE = "https://seriesflixhd.pw";
/** Most candidate pages one lookup may try before giving up on the series. */
const MAX_PROBES = 4;

const decode = (b64) => { try { return atob(b64); } catch (_) { return ""; } };

// nupload wraps another host's player as nupload/iframe/?url=<encoded>; the inner address is the useful one.
function unwrap(url) {
  const m = /^https?:\/\/[^/]+\/iframe\/?\?url=([^&]+)/i.exec(url);
  if (!m) return url;
  try { const inner = decodeURIComponent(m[1]); return /^https?:\/\//i.test(inner) ? inner : url; } catch (_) { return url; }
}

/** Rows {url, lang, quality, server} from the page's language blocks (`<div class="drpdn">`). */
export function rows(html) {
  const out = [];
  for (const block of html.split('<div class="drpdn">').slice(1)) {
    const lang = (/<span>([A-ZÁÉÍÓÚÑ ]+)<span>Idioma<\/span>/.exec(block) || [])[1];
    if (!lang) continue;
    for (const m of block.matchAll(/data-url="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
      const url = unwrap(decode(m[1]));
      if (!/^https?:\/\//i.test(url)) continue;
      // "HD • Waaw": quality, then the player's name
      const info = ((/<span>[^<]*<span>([^<]*)<\/span><\/span>/.exec(m[2]) || [])[1] || "").split("•");
      out.push({ url, lang, quality: (info[0] || "").trim(), server: (info[1] || "").trim() });
    }
  }
  return out;
}

/** Distinct slugs of the show's titles, in priority order (es-MX, es-ES, original, en). */
export function titleSlugs(titles) {
  const out = [];
  for (const t of [titles && titles.esMX, titles && titles.esES, titles && titles.original, titles && titles.en]) {
    const s = slugify(t);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * An episode page's year against its show's run: an episode page may show the episode's own air year, so anything from a year
 * before the first season to a year after the last one (this year + 1 while the show still runs). Another show with the same
 * slug and a year outside that run is turned away.
 */
export function episodeYearOk(found, show) {
  if (!show || !show.year || found == null) return true;
  const first = Number(show.year);
  const last = Number(show.lastYear) || new Date().getFullYear();
  const y = Number(found);
  return y >= first - 1 && y <= Math.max(first, last) + 1;
}

/** The episode page of the series behind [slug] when it is the show asked for (judged on the year), else null. */
async function episodePage(show, slug, req) {
  // The site redirects a bare slug to its own canonical one (breaking-bad -> breaking-bad-zpya).
  const r = await req(`${SITE}/episodio/${slug}-${show.season}x${show.episode}`);
  if (!r.ok) return null;
  const page = r.text();
  const y = /<span class="Date">(\d{4})<\/span>/.exec(page);
  if (!y && show.year) return null;
  return !show.year || episodeYearOk(Number(y[1]), show) ? page : null;
}

/**
 * The copies of an episode this plugin can open: `{ lang: "lat"|"esp"|"sub", server, embedUrl }` for every player on a host an
 * extractor knows. [show] is `{ titles: {esMX, esES, original, en}, year, lastYear, season, episode }`. Empty when the site has
 * no such page or no time is left.
 */
export async function listCopies(show, { req }) {
  if (!show || show.season == null || show.episode == null) return [];
  let html = null;
  try {
    for (const slug of titleSlugs(show.titles).slice(0, MAX_PROBES)) {
      html = await episodePage(show, slug, req);
      if (html) break;
    }
  } catch (e) {
    if (e && e.code === "timeout") return [];
    throw e;
  }
  if (!html) return [];
  const out = [];
  for (const row of rows(html)) {
    const lang = normLang(row.lang);
    const known = lang ? extractorFor(row.url) : null;
    if (known && !out.some((c) => c.embedUrl === row.url)) out.push({ lang, server: known.name, embedUrl: row.url });
  }
  return out;
}
