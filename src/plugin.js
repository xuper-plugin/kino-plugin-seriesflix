// @ts-check
// Kino plugin: Seriesflix — series in Latino, Castilian or subtitled, through seriesflixhd.pw. The site has a page per episode
// listing the players of every language (nupload, Voe); each is opened with its extractor and played as a stream. The catalog
// (home, search, browse, episodes) comes from TMDB through kino.tmdb, which needs no host, and is series only.
//
// The same source the Latino plugin carries (src/sources/seriesflix.js there); this one stands alone, with its own extractors.
//
// Declared hosts: the site (and the two names that redirect to it) and the players'. `streamHosts: "any"` is for the CDNs the
// players redirect to; `fetchHosts: "any"` and `browser` are for Voe, whose domain rotates.

import { listCopies } from "./seriesflix.js";
import { extractorFor } from "./extractors/index.js";
import { makeReq, UA } from "./util/http.js";

// kino.meta and kino.tmdb exist from Kino 0.9.53; the guards are here for the SDK validator.
if (typeof kino.meta !== "function") throw kino.error("unavailable", "kino.meta not available");
if (typeof kino.tmdb !== "function") throw kino.error("unavailable", "kino.tmdb not available");

const TMDB_IMG = "https://image.tmdb.org/t/p/";
const DAY_MS = 24 * 60 * 60 * 1000;
/** One resolve: the show's lookup, the episode page and a few players, each bounded by its own request time. */
const RESOLVE_MS = 40000;
const MAX_COPIES = 8;

// ---- i18n ----

const STRINGS = {
  es: {
    unavailable: "El servicio no está disponible en este momento.",
    noStreams: "No se encontraron fuentes para este episodio.",
    noMeta: "No se encontró información de esta serie.",
    trending: "Series populares",
    onTheAir: "Series en emisión",
    topSeries: "Series mejor valoradas",
    gActionAdv: "Acción y aventura",
    gComedy: "Comedia",
    gSciFi: "Ciencia ficción y fantasía",
    gDrama: "Drama",
    gCrime: "Crimen",
    gMystery: "Misterio",
    gReality: "Reality",
    kids: "Para los niños",
    docs: "Documentales",
    anime: "Anime",
    cacheCleared: "Caché de títulos vaciada.",
    lat: "Latino",
    esp: "Castellano",
    sub: "Subtitulado",
  },
  en: {
    unavailable: "The service is not available right now.",
    noStreams: "No streams found for this episode.",
    noMeta: "No information found for this series.",
    trending: "Trending series",
    onTheAir: "Series on the air",
    topSeries: "Top rated series",
    gActionAdv: "Action and adventure",
    gComedy: "Comedy",
    gSciFi: "Science fiction and fantasy",
    gDrama: "Drama",
    gCrime: "Crime",
    gMystery: "Mystery",
    gReality: "Reality",
    kids: "For kids",
    docs: "Documentaries",
    anime: "Anime",
    cacheCleared: "Title cache cleared.",
    lat: "Latin",
    esp: "Castilian",
    sub: "Subtitled",
  },
};

function t(key) {
  const lang = String(kino.lang || "es").startsWith("en") ? "en" : "es";
  return (STRINGS[lang] || STRINGS.es)[key] || key;
}

// ---- TMDB catalog helpers ----

// TMDB's genre ids as names Kino knows (movie and TV ids). The Home files every title by its genres, one row per genre across
// all plugins, so a title that carries none lands in the bare "Películas" / "Series" rows: that is why a Home with only the
// row's own `genre` showed two rows. Kids, news and talk are types for Kino, not genres: the "kids" row covers them.
const TMDB_GENRES = {
  28: "Acción", 12: "Aventura", 16: "Animación", 35: "Comedia", 80: "Crimen", 99: "Documentales", 18: "Drama", 10751: "Familia",
  14: "Fantasía", 36: "Historia", 27: "Terror", 9648: "Misterio", 10749: "Romance", 878: "Ciencia ficción", 53: "Suspenso",
  10752: "Bélica", 37: "Western", 10759: "Acción", 10765: "Ciencia ficción", 10766: "Drama", 10764: "Reality", 10768: "Bélica",
};

/** The Kino genre names of a TMDB result (`genre_ids`), without repeats, at most 5. */
function genresOf(raw) {
  const names = new Set();
  for (const id of Array.isArray(raw.genre_ids) ? raw.genre_ids : []) if (TMDB_GENRES[id]) names.add(TMDB_GENRES[id]);
  return [...names].slice(0, 5);
}

function itemFromTmdb(raw, kind) {
  const isMovie = kind === "movie";
  const tmdbId = raw.id;
  return {
    id: (isMovie ? "m" : "s") + tmdbId,
    ref: (isMovie ? "m:" : "s:") + tmdbId,
    title: String(raw.title || raw.name || ""),
    kind: isMovie ? "movie" : "series",
    year: (raw.release_date || raw.first_air_date || "").slice(0, 4) || undefined,
    poster: raw.poster_path ? TMDB_IMG + "w500" + raw.poster_path : undefined,
    backdrop: raw.backdrop_path ? TMDB_IMG + "w1280" + raw.backdrop_path : undefined,
    overview: raw.overview || undefined,
    rating: raw.vote_average > 0 ? Math.round(raw.vote_average * 10) / 10 : undefined,
    ids: { tmdb: tmdbId },
    genres: genresOf(raw).length ? genresOf(raw) : undefined,
  };
}

const titlesOf = (query) => [query.q, query.originalTitle, ...(query.altTitles || [])].filter(Boolean);

// ---- home ----

/**
 * The Home rows, in order: series only. `genre` is one of Kino's ten ids (it lines the rows up with other plugins' in the
 * Categorías tab) and `ref` makes the row browsable ("Ver más"). `path` is the TMDB list behind it; `params` narrow it.
 */
const HOME_ROWS = [
  { id: "trending", title: "trending", genre: "series", ref: "trend:tv", path: "/trending/tv/week" },
  { id: "on-the-air", title: "onTheAir", genre: "series", ref: "list:tv:on_the_air", path: "/tv/on_the_air" },
  { id: "top-series", title: "topSeries", genre: "series", ref: "list:tv:top_rated", path: "/tv/top_rated" },
  { id: "g-action", title: "gActionAdv", genre: "series", ref: "genre:tv:10759", path: "/discover/tv", params: { with_genres: 10759 } },
  { id: "g-comedy", title: "gComedy", genre: "series", ref: "genre:tv:35", path: "/discover/tv", params: { with_genres: 35 } },
  { id: "g-scifi", title: "gSciFi", genre: "series", ref: "genre:tv:10765", path: "/discover/tv", params: { with_genres: 10765 } },
  { id: "g-drama", title: "gDrama", genre: "series", ref: "genre:tv:18", path: "/discover/tv", params: { with_genres: 18 } },
  { id: "g-crime", title: "gCrime", genre: "series", ref: "genre:tv:80", path: "/discover/tv", params: { with_genres: 80 } },
  { id: "g-mystery", title: "gMystery", genre: "series", ref: "genre:tv:9648", path: "/discover/tv", params: { with_genres: 9648 } },
  { id: "g-reality", title: "gReality", genre: "series", ref: "genre:tv:10764", path: "/discover/tv", params: { with_genres: 10764 } },
  { id: "kids", title: "kids", genre: "infantil", ref: "genre:tv:10762", path: "/discover/tv", params: { with_genres: 10762 } },
  { id: "docs", title: "docs", genre: "documentales", ref: "genre:tv:99", path: "/discover/tv", params: { with_genres: 99 } },
  { id: "anime", title: "anime", genre: "anime", ref: "anime:tv", path: "/discover/tv", params: { with_genres: 16, with_origin_country: "JP" } },
];

// A discover list sorted by popularity is full of titles nobody has voted on: ask for some votes.
const DISCOVER = { sort_by: "popularity.desc", "vote_count.gte": 200 };

async function homeRow(row) {
  const res = await kino.tmdb(row.path, { ...(row.path.startsWith("/discover") ? DISCOVER : {}), ...(row.params || {}) });
  // a row of posters: what has none looks broken
  const items = (res?.results || []).filter((r) => r.poster_path).slice(0, 20).map((r) => itemFromTmdb(r, "tv"));
  return items.length ? { id: row.id, title: t(row.title), genre: row.genre, ref: row.ref, items } : null;
}

export async function home() {
  // Every row on its own: one that fails or comes back empty is left out, the rest of the Home is still shown.
  const settled = await Promise.allSettled(HOME_ROWS.map(homeRow));
  const rows = settled.map((r) => (r.status === "fulfilled" ? r.value : null)).filter(Boolean);
  if (!rows.length) throw kino.error("unavailable", "no home row could be loaded", { userMessage: t("unavailable") });
  return rows;
}

// ---- search ----

export async function search(query) {
  if (!String(query.q || "").trim()) return [];
  // series only: a movie search has nothing here
  if (query.type === "movie" || query.type === "music" || query.type === "podcast") return [];
  const res = await kino.tmdb("/search/tv", { query: query.q });
  return kino.rank.filterRelevant((res?.results || []).map((r) => itemFromTmdb(r, "tv")), titlesOf(query));
}

// ---- browse ----

export async function browse(ref, cursor) {
  const page = cursor ? Number(cursor) : 1;
  let path, params = { page };

  const parts = String(ref).split(":");
  if (parts[0] === "trend" && parts[1] === "tv") {
    path = "/trending/tv/week";
  } else if (parts[0] === "list" && parts[1] === "tv" && /^[a-z_]+$/.test(parts[2] || "")) {
    path = `/tv/${parts[2]}`;
  } else if (parts[0] === "anime" && parts[1] === "tv") {
    // Japanese animation: TMDB has no anime flag, but animation from Japan is what the Home row means
    path = "/discover/tv";
    params = { ...DISCOVER, with_genres: 16, with_origin_country: "JP", page };
  } else if (parts[0] === "genre" && parts[1] === "tv" && /^\d+$/.test(parts[2] || "")) {
    path = "/discover/tv";
    params = { ...DISCOVER, with_genres: parts[2], page };
  } else {
    return { items: [] };
  }

  const res = await kino.tmdb(path, params);
  const items = (res?.results || []).filter((r) => r.poster_path).map((r) => itemFromTmdb(r, "tv"));
  const next = res?.page < res?.total_pages ? String(page + 1) : undefined;
  return { items, next };
}

// ---- categories ----

export async function categories() {
  const res = await kino.tmdb("/genre/tv/list");
  return (res?.genres || []).slice(0, 24).map((g) => ({ id: "gt" + g.id, title: g.name, ref: "genre:tv:" + g.id }));
}

// ---- episodes ----

export async function episodes(ref) {
  const tmdbId = ref.startsWith("s:") ? ref.slice(2) : ref;
  const meta = await kino.meta({ type: "series", ids: { tmdb: Number(tmdbId) } });
  if (!meta) throw kino.error("not_found", "series not found: tmdb " + tmdbId, { userMessage: t("noMeta") });

  return {
    series: {
      title: meta.title,
      poster: meta.poster,
      backdrop: meta.backdrop,
      overview: meta.overview,
      genres: meta.genres,
      year: meta.year,
      ids: meta.ids,
      runtimeMinutes: meta.runtimeMinutes,
    },
    episodes: (meta.episodes || []).map((ep) => ({
      season: ep.season,
      number: ep.number,
      // the TMDB id rides in the ref: resolve() needs the show's names and years to find its page on the site
      ref: "ep:" + tmdbId + ":" + ep.season + ":" + ep.number,
      title: ep.title,
      still: ep.still,
      overview: ep.overview,
      airDate: ep.airDate,
    })),
  };
}

// ---- resolve ----

const SERVER_LABEL = { nupload: "Nupload", voe: "Voe" };
/** Fastest first: Voe may need the hidden browser (several seconds), nupload is one request. */
const SERVER_ORDER = ["nupload", "voe"];

/** The languages in the order the person prefers them (the "language" setting), the other two after it. */
function languageOrder() {
  const pref = String(kino.config.get("language") || "lat");
  return pref === "esp" ? ["esp", "lat", "sub"] : pref === "sub" ? ["sub", "lat", "esp"] : ["lat", "esp", "sub"];
}

/** The copies, preferred language first, then the faster servers first. */
function ordered(copies) {
  const langs = languageOrder();
  const rank = (c) => langs.indexOf(c.lang) * 10 + Math.max(0, SERVER_ORDER.indexOf(c.server));
  return [...copies].sort((a, b) => rank(a) - rank(b));
}

const labelOf = (c) => `${t(c.lang)} · ${SERVER_LABEL[c.server] || c.server}`;

/** A lazy copy's ref: "cp:<tmdb>:<season>:<episode>:<lang>:<server>". */
const copyRef = (ep, c) => `cp:${ep.tmdbId}:${ep.season}:${ep.episode}:${c.lang}:${c.server}`;

/** The episode a ref names: "ep:<tmdb>:<season>:<episode>", or null. */
function parseEpisodeRef(ref) {
  const m = /^ep:(\d+):(\d+):(\d+)$/.exec(ref);
  return m ? { tmdbId: m[1], season: Number(m[2]), episode: Number(m[3]) } : null;
}

/** The wanted episode and copy out of a lazy ref, or null. */
function parseCopyRef(ref) {
  const m = /^cp:(\d+):(\d+):(\d+):(lat|esp|sub):([a-z]+)$/.exec(ref);
  return m ? { ep: { tmdbId: m[1], season: Number(m[2]), episode: Number(m[3]) }, lang: m[4], server: m[5] } : null;
}

/**
 * What the site needs to find a show's page: its titles in the languages it uses and its years (to turn away another show with
 * the same name). Kept 7 days.
 */
async function showOf(ep) {
  const key = "show:" + ep.tmdbId;
  // kino.storage keeps text only: the names ride as JSON
  let info = null;
  try { info = JSON.parse(kino.storage.get(key) || "null"); } catch (_) { info = null; }
  if (!info || !info.titles) {
    const d = await kino.tmdb(`/tv/${ep.tmdbId}`, { language: "es-MX", append_to_response: "translations" });
    if (!d || !d.id) throw kino.error("not_found", "series not found: tmdb " + ep.tmdbId, { userMessage: t("noMeta") });
    const translated = (country) => ((d.translations?.translations || []).find((x) => x.iso_3166_1 === country)?.data?.name) || "";
    info = {
      titles: { esMX: d.name || "", esES: translated("ES"), original: d.original_name || d.name || "", en: translated("US") },
      year: Number(String(d.first_air_date || "").slice(0, 4)) || null,
      lastYear: d.in_production ? null : Number(String(d.last_air_date || "").slice(0, 4)) || null,
    };
    kino.storage.set(key, JSON.stringify(info), { ttlMs: 7 * DAY_MS });
  }
  return { ...info, season: ep.season, episode: ep.episode };
}

/** A Stream from an extractor's answer; the player sends okhttp's User-Agent unless told otherwise and the CDNs answer 403 to it. */
function toStream(s, c) {
  const out = { url: s.url, label: labelOf(c), headers: { "User-Agent": UA, ...(s.headers && typeof s.headers === "object" ? s.headers : {}) } };
  if (s.mime) out.mime = s.mime;
  const subs = Array.isArray(s.subtitles) ? s.subtitles.filter((x) => x && x.lang && x.url) : [];
  if (subs.length) out.subtitles = subs;
  if (Number.isFinite(s.durationMs) && s.durationMs > 0) out.durationMs = Math.round(s.durationMs);
  return out;
}

/** One copy opened: the stream, or null when its player shows none (or fails). */
async function open(c, req) {
  const ex = extractorFor(c.embedUrl);
  if (!ex) return null;
  try {
    const s = await ex.extract(c.embedUrl, req, kino);
    return s && typeof s.url === "string" && s.url ? toStream(s, c) : null;
  } catch (e) {
    kino.log("[seriesflix]", c.server, (e && e.code) || "extract_failed");
    return null;
  }
}

export async function resolve(ref) {
  const req = makeReq(kino, { deadline: Date.now() + RESOLVE_MS });

  // One copy picked from the Servidor menu (or reached by the automatic fallback): just that one
  if (ref.startsWith("cp:")) {
    const want = parseCopyRef(ref);
    if (!want) throw kino.error("not_found", "bad copy ref");
    const copy = (await listCopies(await showOf(want.ep), { req })).find((c) => c.lang === want.lang && c.server === want.server);
    const stream = copy ? await open(copy, req) : null;
    if (!stream) throw kino.error("not_found", "copy not available: " + want.lang + "/" + want.server, { userMessage: t("noStreams") });
    return stream;
  }

  const ep = parseEpisodeRef(ref);
  if (!ep) throw kino.error("not_found", "unknown ref: " + ref.slice(0, 40));
  const copies = ordered(await listCopies(await showOf(ep), { req }));
  if (!copies.length) throw kino.error("not_found", "no copies for tmdb " + ep.tmdbId + " " + ep.season + "x" + ep.episode, { userMessage: t("noStreams") });

  // The first copy that opens plays; the rest are lazy copies, opened only if the person (or the fallback) reaches them
  let main = null;
  let tried = 0;
  for (const c of copies) {
    tried++;
    main = await open(c, req);
    if (main) break;
  }
  if (!main) throw kino.error("not_found", "no copy opened for tmdb " + ep.tmdbId, { userMessage: t("noStreams") });
  const alternatives = copies.slice(tried).slice(0, MAX_COPIES).map((c) => ({ label: labelOf(c), ref: copyRef(ep, c) }));
  return { ...main, ...(alternatives.length ? { alternatives } : {}) };
}

// ---- settings actions ----

export async function action(key) {
  if (key === "clearCache") {
    for (const k of kino.storage.keys()) {
      if (k.startsWith("show:")) kino.storage.remove(k);
    }
    return { message: t("cacheCleared") };
  }
}
