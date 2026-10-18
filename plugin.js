var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/extractors/nupload.js
var nupload_exports = {};
__export(nupload_exports, {
  HOSTS: () => HOSTS,
  extract: () => extract
});

// src/extractors/shared.js
var HLS_MIME = "application/vnd.apple.mpegurl";
function miss(kino2, server, reason) {
  if (kino2 && typeof kino2.log === "function") kino2.log("[embed69]", server, reason);
  return null;
}

// src/extractors/nupload.js
var HOSTS = ["nupload.me", "nupload.my"];
async function extract(embedUrl, req, kino2) {
  const origin = new URL(embedUrl).origin;
  const r = await req(embedUrl, { headers: { Referer: origin + "/" } });
  if (!r.ok) return miss(kino2, "nupload", "status " + r.status);
  const html = r.text();
  const arr = /([A-Za-z]+)\.forEach\s*\(function\s+\w+\s*\(value\)\s*\{[^}]+atob/.exec(html);
  if (!arr) return miss(kino2, "nupload", "no encoded address");
  const name = arr[1];
  const off = new RegExp(name + "\\.forEach[^-]+-\\s*(\\d+)").exec(html);
  const list = new RegExp("var\\s+" + name + "\\s*=\\s*(\\[[^\\]]+\\])").exec(html);
  const sesz = /var sesz\s*=\s*"([^"]+)"/.exec(html);
  if (!off || !list || !sesz) return miss(kino2, "nupload", "encoded address incomplete");
  let path = "";
  for (const v of JSON.parse(list[1])) {
    path += String.fromCharCode(parseInt(atob(v).replace(/\D/g, ""), 10) - parseInt(off[1], 10));
  }
  let url;
  try {
    url = new URL(path + "?s=" + sesz[1], origin).href;
  } catch (_) {
    return miss(kino2, "nupload", "bad address");
  }
  return /^https:\/\//i.test(url) ? { url, mime: HLS_MIME, headers: { Referer: origin + "/", Origin: origin } } : miss(kino2, "nupload", "not https");
}

// src/extractors/voe.js
var voe_exports = {};
__export(voe_exports, {
  HOSTS: () => HOSTS2,
  canCapture: () => canCapture,
  decodeVoe: () => decodeVoe,
  extract: () => extract2
});
var HOSTS2 = ["voe.sx"];
var JUNK = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
var rot13 = (s) => s.replace(/[a-z]/gi, (c) => {
  const b = c <= "Z" ? 65 : 97;
  return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b);
});
function decodeVoe(enc) {
  let s = rot13(enc);
  for (const j of JUNK) s = s.split(j).join("");
  s = atob(s);
  s = [...s].map((c) => String.fromCharCode(c.charCodeAt(0) - 3)).join("");
  s = [...s].reverse().join("");
  return JSON.parse(decodeURIComponent(escape(atob(s))));
}
var redirectOf = (html) => (/window\.location\.href\s*=\s*'([^']+)'/.exec(html) || [])[1] || null;
var fetchesAnyHost = (kino2) => !!(kino2 && kino2.fetchAnyHost === true);
var canCapture = (kino2) => !!(kino2 && kino2.browser && kino2.browser.captureAll === true && typeof kino2.browser.capture === "function");
var CAPTURE_MS = 12e3;
var MIN_CAPTURE_MS = 3e3;
async function capture(embedUrl, req, kino2) {
  const ms = Math.min(CAPTURE_MS, (req.left ? req.left() : CAPTURE_MS) - 300);
  if (ms < MIN_CAPTURE_MS) {
    kino2.log("[seriesflix]", "voe", "no time to capture");
    return null;
  }
  let cap;
  try {
    cap = await kino2.browser.capture(embedUrl, { match: "\\.m3u8|\\.mp4", timeoutMs: ms });
  } catch (e) {
    kino2.log("[seriesflix]", "voe capture", e && e.code || "error");
    return null;
  }
  const m = cap && Array.isArray(cap.media) ? cap.media.find((x) => x && typeof x.url === "string" && /^https?:\/\//i.test(x.url)) : null;
  if (!m) {
    kino2.log("[seriesflix]", "voe capture", "no media");
    return null;
  }
  const mime = m.mime || (/\.mp4(?:[?#]|$)/i.test(m.url) ? "video/mp4" : HLS_MIME);
  return { url: m.url, mime, headers: { Referer: embedUrl, ...m.headers || {} } };
}
async function extract2(embedUrl, req, kino2) {
  const log = (...a) => {
    if (kino2) kino2.log("[seriesflix]", "voe", ...a);
  };
  const first = await req(embedUrl, { headers: { Referer: embedUrl } });
  if (!first.ok) {
    log("embed", first.status);
    return null;
  }
  let html = first.text();
  const next = redirectOf(html);
  if (next) {
    if (!fetchesAnyHost(kino2)) {
      if (canCapture(kino2)) return capture(embedUrl, req, kino2);
      log("rotating host, no way to reach it");
      return null;
    }
    try {
      const r = await req(next, { headers: { Referer: embedUrl } });
      if (!r.ok) {
        log("player", r.status);
        return null;
      }
      html = r.text();
    } catch (e) {
      if (!(e && e.code === "host_not_allowed")) throw e;
      if (canCapture(kino2)) return capture(embedUrl, req, kino2);
      log("host_not_allowed");
      return null;
    }
  }
  const j = /<script type="application\/json">\s*\["([^"]+)"\]/.exec(html);
  if (j) {
    try {
      const d = decodeVoe(j[1]);
      const url = d.source || d.direct_access_url;
      if (url) return { url, mime: /\.mp4/.test(url) ? "video/mp4" : HLS_MIME, headers: { Referer: embedUrl } };
    } catch (_) {
    }
  }
  const h = /'hls'\s*:\s*'([^']+)'/.exec(html) || /(https?:\/\/[^"'\s]+\.mp4[^"'\s]*)/.exec(html);
  if (!h) {
    log("no stream in page");
    return null;
  }
  return { url: h[1], headers: { Referer: embedUrl } };
}

// src/extractors/index.js
var TABLE = { nupload: nupload_exports, voe: voe_exports };
function extractorFor(embedUrl) {
  let host;
  try {
    host = new URL(embedUrl).hostname.replace(/^www\./, "");
  } catch (_) {
    return null;
  }
  for (const [name, mod] of Object.entries(TABLE)) {
    if (mod.HOSTS.some((h) => host === h || host.endsWith("." + h))) return { name, extract: mod.extract };
  }
  return null;
}
var HOSTS3 = Object.values(TABLE).flatMap((m) => m.HOSTS);

// src/util/lang.js
function normLang(text) {
  const s = String(text || "").toLowerCase();
  if (/\b(sub|subs|vose|subtitulado|subtitulada)\b/.test(s)) return "sub";
  if (/\b(lat|latino|latam|mx|mex|col|es-mx)\b/.test(s)) return "lat";
  if (/\b(cast|castellano|esp|español|espanol|es-es|spain)\b/.test(s)) return "esp";
  if (/(?:^|[^a-z0-9ñ])(españa|espana)(?:$|[^a-z0-9ñ])/.test(s)) return "esp";
  return null;
}

// src/util/slug.js
function slugify(title) {
  return String(title || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// src/seriesflix.js
var SITE = "https://seriesflixhd.pw";
var MAX_PROBES = 4;
var decode = (b64) => {
  try {
    return atob(b64);
  } catch (_) {
    return "";
  }
};
function unwrap(url) {
  const m = /^https?:\/\/[^/]+\/iframe\/?\?url=([^&]+)/i.exec(url);
  if (!m) return url;
  try {
    const inner = decodeURIComponent(m[1]);
    return /^https?:\/\//i.test(inner) ? inner : url;
  } catch (_) {
    return url;
  }
}
function rows(html) {
  const out = [];
  for (const block of html.split('<div class="drpdn">').slice(1)) {
    const lang = (/<span>([A-ZÁÉÍÓÚÑ ]+)<span>Idioma<\/span>/.exec(block) || [])[1];
    if (!lang) continue;
    for (const m of block.matchAll(/data-url="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
      const url = unwrap(decode(m[1]));
      if (!/^https?:\/\//i.test(url)) continue;
      const info = ((/<span>[^<]*<span>([^<]*)<\/span><\/span>/.exec(m[2]) || [])[1] || "").split("\u2022");
      out.push({ url, lang, quality: (info[0] || "").trim(), server: (info[1] || "").trim() });
    }
  }
  return out;
}
function titleSlugs(titles) {
  const out = [];
  for (const t2 of [titles && titles.esMX, titles && titles.esES, titles && titles.original, titles && titles.en]) {
    const s = slugify(t2);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}
function episodeYearOk(found, show) {
  if (!show || !show.year || found == null) return true;
  const first = Number(show.year);
  const last = Number(show.lastYear) || (/* @__PURE__ */ new Date()).getFullYear();
  const y = Number(found);
  return y >= first - 1 && y <= Math.max(first, last) + 1;
}
async function episodePage(show, slug, req) {
  const r = await req(`${SITE}/episodio/${slug}-${show.season}x${show.episode}`);
  if (!r.ok) return null;
  const page = r.text();
  const y = /<span class="Date">(\d{4})<\/span>/.exec(page);
  if (!y && show.year) return null;
  return !show.year || episodeYearOk(Number(y[1]), show) ? page : null;
}
async function listCopies(show, { req }) {
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

// src/util/http.js
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
var REQUEST_MS = 8e3;
var MIN_MS = 1500;
function makeReq(kino2, { deadline }) {
  const req = async (url, opts = {}) => {
    const left = deadline - Date.now();
    if (left < MIN_MS) throw kino2.error("timeout", "no time left for " + new URL(url).hostname);
    return kino2.fetch(url, { headers: { "User-Agent": UA, ...opts.headers || {} }, method: opts.method, body: opts.body, timeoutMs: Math.min(REQUEST_MS, left) });
  };
  req.left = () => Math.max(0, deadline - Date.now());
  return req;
}

// src/plugin.js
if (typeof kino.meta !== "function") throw kino.error("unavailable", "kino.meta not available");
if (typeof kino.tmdb !== "function") throw kino.error("unavailable", "kino.tmdb not available");
var TMDB_IMG = "https://image.tmdb.org/t/p/";
var DAY_MS = 24 * 60 * 60 * 1e3;
var RESOLVE_MS = 4e4;
var MAX_COPIES = 8;
var STRINGS = {
  es: {
    unavailable: "El servicio no est\xE1 disponible en este momento.",
    noStreams: "No se encontraron fuentes para este episodio.",
    noMeta: "No se encontr\xF3 informaci\xF3n de esta serie.",
    trending: "Series populares",
    onTheAir: "Series en emisi\xF3n",
    topSeries: "Series mejor valoradas",
    gActionAdv: "Acci\xF3n y aventura",
    gComedy: "Comedia",
    gSciFi: "Ciencia ficci\xF3n y fantas\xEDa",
    gDrama: "Drama",
    gCrime: "Crimen",
    gMystery: "Misterio",
    gReality: "Reality",
    kids: "Para los ni\xF1os",
    docs: "Documentales",
    anime: "Anime",
    cacheCleared: "Cach\xE9 de t\xEDtulos vaciada.",
    lat: "Latino",
    esp: "Castellano",
    sub: "Subtitulado"
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
    sub: "Subtitled"
  }
};
function t(key) {
  const lang = String(kino.lang || "es").startsWith("en") ? "en" : "es";
  return (STRINGS[lang] || STRINGS.es)[key] || key;
}
var TMDB_GENRES = {
  28: "Acci\xF3n",
  12: "Aventura",
  16: "Animaci\xF3n",
  35: "Comedia",
  80: "Crimen",
  99: "Documentales",
  18: "Drama",
  10751: "Familia",
  14: "Fantas\xEDa",
  36: "Historia",
  27: "Terror",
  9648: "Misterio",
  10749: "Romance",
  878: "Ciencia ficci\xF3n",
  53: "Suspenso",
  10752: "B\xE9lica",
  37: "Western",
  10759: "Acci\xF3n",
  10765: "Ciencia ficci\xF3n",
  10766: "Drama",
  10764: "Reality",
  10768: "B\xE9lica"
};
function genresOf(raw) {
  const names = /* @__PURE__ */ new Set();
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
    year: (raw.release_date || raw.first_air_date || "").slice(0, 4) || void 0,
    poster: raw.poster_path ? TMDB_IMG + "w500" + raw.poster_path : void 0,
    backdrop: raw.backdrop_path ? TMDB_IMG + "w1280" + raw.backdrop_path : void 0,
    overview: raw.overview || void 0,
    rating: raw.vote_average > 0 ? Math.round(raw.vote_average * 10) / 10 : void 0,
    ids: { tmdb: tmdbId },
    genres: genresOf(raw).length ? genresOf(raw) : void 0
  };
}
var titlesOf = (query) => [query.q, query.originalTitle, ...query.altTitles || []].filter(Boolean);
var HOME_ROWS = [
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
  { id: "anime", title: "anime", genre: "anime", ref: "anime:tv", path: "/discover/tv", params: { with_genres: 16, with_origin_country: "JP" } }
];
var DISCOVER = { sort_by: "popularity.desc", "vote_count.gte": 200 };
async function homeRow(row) {
  const res = await kino.tmdb(row.path, { ...row.path.startsWith("/discover") ? DISCOVER : {}, ...row.params || {} });
  const items = (res?.results || []).filter((r) => r.poster_path).slice(0, 20).map((r) => itemFromTmdb(r, "tv"));
  return items.length ? { id: row.id, title: t(row.title), genre: row.genre, ref: row.ref, items } : null;
}
async function home() {
  const settled = await Promise.allSettled(HOME_ROWS.map(homeRow));
  const rows2 = settled.map((r) => r.status === "fulfilled" ? r.value : null).filter(Boolean);
  if (!rows2.length) throw kino.error("unavailable", "no home row could be loaded", { userMessage: t("unavailable") });
  return rows2;
}
async function search(query) {
  if (!String(query.q || "").trim()) return [];
  if (query.type === "movie" || query.type === "music" || query.type === "podcast") return [];
  const res = await kino.tmdb("/search/tv", { query: query.q });
  return kino.rank.filterRelevant((res?.results || []).map((r) => itemFromTmdb(r, "tv")), titlesOf(query));
}
async function browse(ref, cursor) {
  const page = cursor ? Number(cursor) : 1;
  let path, params = { page };
  const parts = String(ref).split(":");
  if (parts[0] === "trend" && parts[1] === "tv") {
    path = "/trending/tv/week";
  } else if (parts[0] === "list" && parts[1] === "tv" && /^[a-z_]+$/.test(parts[2] || "")) {
    path = `/tv/${parts[2]}`;
  } else if (parts[0] === "anime" && parts[1] === "tv") {
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
  const next = res?.page < res?.total_pages ? String(page + 1) : void 0;
  return { items, next };
}
async function categories() {
  const res = await kino.tmdb("/genre/tv/list");
  return (res?.genres || []).slice(0, 24).map((g) => ({ id: "gt" + g.id, title: g.name, ref: "genre:tv:" + g.id }));
}
async function episodes(ref) {
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
      runtimeMinutes: meta.runtimeMinutes
    },
    episodes: (meta.episodes || []).map((ep) => ({
      season: ep.season,
      number: ep.number,
      // the TMDB id rides in the ref: resolve() needs the show's names and years to find its page on the site
      ref: "ep:" + tmdbId + ":" + ep.season + ":" + ep.number,
      title: ep.title,
      still: ep.still,
      overview: ep.overview,
      airDate: ep.airDate
    }))
  };
}
var SERVER_LABEL = { nupload: "Nupload", voe: "Voe" };
var SERVER_ORDER = ["nupload", "voe"];
function languageOrder() {
  const pref = String(kino.config.get("language") || "lat");
  return pref === "esp" ? ["esp", "lat", "sub"] : pref === "sub" ? ["sub", "lat", "esp"] : ["lat", "esp", "sub"];
}
function ordered(copies) {
  const langs = languageOrder();
  const rank = (c) => langs.indexOf(c.lang) * 10 + Math.max(0, SERVER_ORDER.indexOf(c.server));
  return [...copies].sort((a, b) => rank(a) - rank(b));
}
var labelOf = (c) => `${t(c.lang)} \xB7 ${SERVER_LABEL[c.server] || c.server}`;
var copyRef = (ep, c) => `cp:${ep.tmdbId}:${ep.season}:${ep.episode}:${c.lang}:${c.server}`;
function parseEpisodeRef(ref) {
  const m = /^ep:(\d+):(\d+):(\d+)$/.exec(ref);
  return m ? { tmdbId: m[1], season: Number(m[2]), episode: Number(m[3]) } : null;
}
function parseCopyRef(ref) {
  const m = /^cp:(\d+):(\d+):(\d+):(lat|esp|sub):([a-z]+)$/.exec(ref);
  return m ? { ep: { tmdbId: m[1], season: Number(m[2]), episode: Number(m[3]) }, lang: m[4], server: m[5] } : null;
}
async function showOf(ep) {
  const key = "show:" + ep.tmdbId;
  let info = null;
  try {
    info = JSON.parse(kino.storage.get(key) || "null");
  } catch (_) {
    info = null;
  }
  if (!info || !info.titles) {
    const d = await kino.tmdb(`/tv/${ep.tmdbId}`, { language: "es-MX", append_to_response: "translations" });
    if (!d || !d.id) throw kino.error("not_found", "series not found: tmdb " + ep.tmdbId, { userMessage: t("noMeta") });
    const translated = (country) => (d.translations?.translations || []).find((x) => x.iso_3166_1 === country)?.data?.name || "";
    info = {
      titles: { esMX: d.name || "", esES: translated("ES"), original: d.original_name || d.name || "", en: translated("US") },
      year: Number(String(d.first_air_date || "").slice(0, 4)) || null,
      lastYear: d.in_production ? null : Number(String(d.last_air_date || "").slice(0, 4)) || null
    };
    kino.storage.set(key, JSON.stringify(info), { ttlMs: 7 * DAY_MS });
  }
  return { ...info, season: ep.season, episode: ep.episode };
}
function toStream(s, c) {
  const out = { url: s.url, label: labelOf(c), headers: { "User-Agent": UA, ...s.headers && typeof s.headers === "object" ? s.headers : {} } };
  if (s.mime) out.mime = s.mime;
  const subs = Array.isArray(s.subtitles) ? s.subtitles.filter((x) => x && x.lang && x.url) : [];
  if (subs.length) out.subtitles = subs;
  if (Number.isFinite(s.durationMs) && s.durationMs > 0) out.durationMs = Math.round(s.durationMs);
  return out;
}
async function open(c, req) {
  const ex = extractorFor(c.embedUrl);
  if (!ex) return null;
  try {
    const s = await ex.extract(c.embedUrl, req, kino);
    return s && typeof s.url === "string" && s.url ? toStream(s, c) : null;
  } catch (e) {
    kino.log("[seriesflix]", c.server, e && e.code || "extract_failed");
    return null;
  }
}
async function resolve(ref) {
  const req = makeReq(kino, { deadline: Date.now() + RESOLVE_MS });
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
  let main = null;
  let tried = 0;
  for (const c of copies) {
    tried++;
    main = await open(c, req);
    if (main) break;
  }
  if (!main) throw kino.error("not_found", "no copy opened for tmdb " + ep.tmdbId, { userMessage: t("noStreams") });
  const alternatives = copies.slice(tried).slice(0, MAX_COPIES).map((c) => ({ label: labelOf(c), ref: copyRef(ep, c) }));
  return { ...main, ...alternatives.length ? { alternatives } : {} };
}
async function action(key) {
  if (key === "clearCache") {
    for (const k of kino.storage.keys()) {
      if (k.startsWith("show:")) kino.storage.remove(k);
    }
    return { message: t("cacheCleared") };
  }
}
export {
  action,
  browse,
  categories,
  episodes,
  home,
  resolve,
  search
};
