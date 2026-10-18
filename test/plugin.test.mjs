// node --test test/plugin.test.mjs
// Offline: a fake seriesflixhd.pw (episode pages with language blocks), fake players and a stub of `kino`.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateManifest } from "../sdk/contract.mjs";

const calls = [];
let config = {};
const tmdbCalls = [];
let tmdbImpl = async () => ({ results: [] });
let metaImpl = async () => null;
let pages = {};
let logs = [];
let store = new Map();
globalThis.kino = {
  lang: "es",
  config: { get: (k) => config[k] },
  fetch: async (url, opts = {}) => {
    calls.push({ url, opts });
    const p = pages[url];
    if (!p) return { ok: false, status: 404, text: () => "", json: () => ({}) };
    const status = p.status ?? 200;
    return { ok: status < 400, status, text: () => p.body, json: () => JSON.parse(p.body) };
  },
  // like the real one: it keeps text, whatever it is given
  storage: { get: (k) => store.get(k) ?? null, set: (k, v) => store.set(k, String(v)), keys: () => [...store.keys()], remove: (k) => store.delete(k) },
  log: (...a) => logs.push(a.join(" ")),
  tmdb: async (path, params) => { tmdbCalls.push({ path, params }); return tmdbImpl(path, params); },
  meta: (q) => metaImpl(q), rank: {},
  error: (code, message, opts = {}) => Object.assign(new Error(message), { code, ...opts }),
};
const plugin = await import("../plugin.js");

beforeEach(() => { calls.length = 0; tmdbCalls.length = 0; logs = []; config = {}; pages = {}; store = new Map(); delete globalThis.kino.fetchAnyHost; delete globalThis.kino.browser; metaImpl = async () => null; tmdbImpl = async () => ({ results: [] }); });

const SITE = "https://seriesflixhd.pw";
const b64 = (s) => Buffer.from(s).toString("base64");

/** TMDB's answer for a show: titles in es-MX, with the es-ES and en translations, and the years of its run. */
const SHOW = (over = {}) => ({ id: 1396, name: "Breaking Bad", original_name: "Breaking Bad", first_air_date: "2008-01-20", last_air_date: "2013-09-29", in_production: false,
  translations: { translations: [{ iso_3166_1: "ES", data: { name: "Breaking Bad" } }, { iso_3166_1: "US", data: { name: "Breaking Bad" } }] }, ...over });

/** A nupload watch page whose address is hidden the way the real one hides it: an array of base64 numbers minus an offset. */
const NUP_OFFSET = 7;
const nuploadPage = (path, sesz = "tok1") => `<script>var abc = [${[...path].map((ch) => `"${b64(String(ch.charCodeAt(0) + NUP_OFFSET))}"`).join(",")}];
abc.forEach(function f(value){ x += String.fromCharCode(parseInt(atob(value).replace(/\\D/g,""), 10) - ${NUP_OFFSET}); });
var sesz = "${sesz}";</script>`;

const row = (n, lang, label, url) => `<li><div data-url="${b64(url)}" class="Button sgty"> <span class="nmopt">0${n}</span> <span>${lang}<span>${label}</span></span></div></li>`;
const block = (lang, rows) => `<div class="drpdn"> <button class="bstd Button"> <span>${lang}<span>Idioma</span></span> <ul>${rows.join("")}</ul> </button> </div>`;
const episodePage = (blocks, year = 2008) => `<html><span class="Date">${year}</span>${blocks.join("")}</html>`;

const NUP = (id) => `https://nupload.my/watch/${id}`;
const VOE_WRAPPED = (id) => `https://nupload.my/iframe/?url=${encodeURIComponent("https://voe.sx/e/" + id)}`;
const BLOCKS = [
  block("LATINO", [row(1, "LATINO", "HD • Principal", NUP("lat")), row(2, "LATINO", "HD • Waaw", VOE_WRAPPED("voelat"))]),
  block("CASTELLANO", [row(1, "CASTELLANO", "HD • Principal", NUP("esp"))]),
  block("SUBTITULADO", [row(1, "SUBTITULADO", "HD • Principal", NUP("sub"))]),
];
/** The site's page for an episode, and the nupload watch pages of its copies. */
function serve(slug, season, episode, blocks = BLOCKS, extra = {}) {
  pages = {
    [`${SITE}/episodio/${slug}-${season}x${episode}`]: { body: episodePage(blocks) },
    [NUP("lat")]: { body: nuploadPage("/p/lat.m3u8", "tokL") },
    [NUP("esp")]: { body: nuploadPage("/p/esp.m3u8", "tokE") },
    [NUP("sub")]: { body: nuploadPage("/p/sub.m3u8", "tokS") },
    "https://voe.sx/e/voelat": { body: `<script>window.location.href = 'https://rotating.example/e/voelat'</script>` },
    "https://rotating.example/e/voelat": { body: `{'hls': 'https://cdn.example/voe/master.m3u8'}` },
    ...extra,
  };
  tmdbImpl = async (path) => (path === "/tv/1396" ? SHOW() : { results: [] });
}

const manifest = JSON.parse(readFileSync(new URL("../kino-plugin.json", import.meta.url), "utf8"));

test("the manifest is valid for Kino, declares the site, its old names and the players, and is series only", () => {
  const out = validateManifest(readFileSync(new URL("../kino-plugin.json", import.meta.url), "utf8"));
  assert.ok(!out.errors?.length, JSON.stringify(out.errors));
  for (const h of ["seriesflixhd.pw", "seriesflixhd.casa", "seriesflixhd.best", "nupload.my", "nupload.me", "voe.sx"]) assert.ok(manifest.hosts.includes(h), h);
  assert.deepEqual(manifest.categories, ["series"]);
  assert.ok(manifest.capabilities.includes("download"));
});

test("an episode finds the show's page by its title, plays the first copy that opens (Latino on nupload) and keeps the rest lazy", async () => {
  serve("breaking-bad", 1, 1);
  const a = await plugin.resolve("ep:1396:1:1");
  assert.ok(calls.some((c) => c.url === `${SITE}/episodio/breaking-bad-1x1`));
  assert.equal(a.url, "https://nupload.my/p/lat.m3u8?s=tokL");
  assert.equal(a.label, "Latino · Nupload");
  assert.equal(a.mime, "application/vnd.apple.mpegurl");
  assert.equal(a.headers.Referer, "https://nupload.my/");
  assert.match(a.headers["User-Agent"], /Mozilla/);
  assert.deepEqual(a.alternatives.map((x) => x.label), ["Latino · Voe", "Castellano · Nupload", "Subtitulado · Nupload"]);
  assert.deepEqual(a.alternatives.map((x) => x.ref), ["cp:1396:1:1:lat:voe", "cp:1396:1:1:esp:nupload", "cp:1396:1:1:sub:nupload"]);
  assert.ok(a.alternatives.every((x) => x.ref.length <= 512 && !x.url));
});

test("every request carries a browser User-Agent (the players answer okhttp's with another page), beside the source's own headers", async () => {
  serve("breaking-bad", 1, 1);
  await plugin.resolve("ep:1396:1:1");
  assert.ok(calls.length >= 2);
  for (const c of calls) assert.match(c.opts.headers["User-Agent"], /^Mozilla\/5\.0 .*Chrome/, c.url);
});

test("the show's names come from TMDB (es-MX with the es-ES and en translations) and are kept", async () => {
  serve("breaking-bad", 1, 1);
  await plugin.resolve("ep:1396:1:1");
  assert.equal(tmdbCalls[0].path, "/tv/1396");
  assert.equal(tmdbCalls[0].params.language, "es-MX");
  assert.equal(tmdbCalls[0].params.append_to_response, "translations");
  tmdbCalls.length = 0;
  const again = await plugin.resolve("ep:1396:1:1");
  assert.equal(tmdbCalls.length, 0, "the second time the names come from the cache");
  assert.equal(again.label, "Latino · Nupload", "and they still find the page");
  store.set("show:1396", "[object Object]"); // a value an older build left behind is asked again, not trusted
  assert.equal((await plugin.resolve("ep:1396:1:1")).label, "Latino · Nupload");
  assert.equal(tmdbCalls.length, 1);
});

test("titles are tried in order (es-MX, es-ES, original, en), one slug per distinct title, and the first page that is the show wins", async () => {
  tmdbImpl = async () => SHOW({ name: "Perdidos", original_name: "Lost", translations: { translations: [{ iso_3166_1: "ES", data: { name: "Lost: Perdidos" } }, { iso_3166_1: "US", data: { name: "Lost" } }] } });
  pages = { [`${SITE}/episodio/lost-1x1`]: { body: episodePage(BLOCKS) }, [NUP("lat")]: { body: nuploadPage("/p/lat.m3u8") } };
  const a = await plugin.resolve("ep:1396:1:1");
  assert.equal(a.label, "Latino · Nupload");
  assert.deepEqual(calls.filter((c) => c.url.includes("/episodio/")).map((c) => c.url.split("/episodio/")[1]), ["perdidos-1x1", "lost-perdidos-1x1", "lost-1x1"]);
});

test("another show with the same name is turned away by its year; the first season-year of the run is tolerated", async () => {
  serve("breaking-bad", 1, 1, BLOCKS);
  pages[`${SITE}/episodio/breaking-bad-1x1`] = { body: episodePage(BLOCKS, 1991) };
  await assert.rejects(() => plugin.resolve("ep:1396:1:1"), (e) => e.code === "not_found" && e.userMessage === "No se encontraron fuentes para este episodio.");
  pages[`${SITE}/episodio/breaking-bad-1x1`] = { body: episodePage(BLOCKS, 2007) };
  assert.equal((await plugin.resolve("ep:1396:1:1")).label, "Latino · Nupload");
});

test("the language setting puts Castellano or Subtitulado first", async () => {
  serve("breaking-bad", 1, 1);
  config = { language: "esp" };
  const a = await plugin.resolve("ep:1396:1:1");
  assert.equal(a.label, "Castellano · Nupload");
  assert.equal(a.alternatives[0].label, "Latino · Nupload");
  config = { language: "sub" };
  assert.equal((await plugin.resolve("ep:1396:1:1")).label, "Subtitulado · Nupload");
});

test("a lazy copy opens just that server; one the page no longer lists is not_found", async () => {
  serve("breaking-bad", 2, 5);
  const a = await plugin.resolve("cp:1396:2:5:esp:nupload");
  assert.equal(a.url, "https://nupload.my/p/esp.m3u8?s=tokE");
  assert.equal(a.label, "Castellano · Nupload");
  assert.equal(a.alternatives, undefined);
  await assert.rejects(() => plugin.resolve("cp:1396:2:5:sub:voe"), (e) => e.code === "not_found" && e.userMessage === "No se encontraron fuentes para este episodio.");
  await assert.rejects(() => plugin.resolve("cp:garbage"), (e) => e.code === "not_found");
});

test("a nupload link that wraps Voe is unwrapped; Voe is fetched through the rotating domain when Kino lets the plugin", async () => {
  serve("breaking-bad", 1, 1);
  globalThis.kino.fetchAnyHost = true;
  const a = await plugin.resolve("cp:1396:1:1:lat:voe");
  assert.equal(a.url, "https://cdn.example/voe/master.m3u8");
  assert.equal(a.label, "Latino · Voe");
});

test("without a way to reach Voe's rotating domain that copy cannot open; with the hidden browser it does", async () => {
  serve("breaking-bad", 1, 1);
  await assert.rejects(() => plugin.resolve("cp:1396:1:1:lat:voe"), (e) => e.code === "not_found");
  assert.ok(logs.some((l) => l.includes("rotating host")));
  globalThis.kino.browser = { captureAll: true, capture: async () => ({ media: [{ url: "https://cdn.example/captured/master.m3u8" }] }) };
  assert.equal((await plugin.resolve("cp:1396:1:1:lat:voe")).url, "https://cdn.example/captured/master.m3u8");
});

test("a copy whose player shows nothing is skipped: the next one plays, and the failed one is not offered again", async () => {
  serve("breaking-bad", 1, 1, BLOCKS, { [NUP("lat")]: { status: 500, body: "" } });
  const a = await plugin.resolve("ep:1396:1:1");
  assert.equal(a.label, "Castellano · Nupload");
  assert.ok(!a.alternatives.some((x) => x.label === "Latino · Nupload"));
});

test("players no extractor knows are left out; with only those, the person reads a readable error", async () => {
  serve("breaking-bad", 1, 1, [block("LATINO", [row(1, "LATINO", "HD • Waaw", "https://netu.example/e/1"), row(2, "LATINO", "HD • Pl", "https://streamtape.example/e/2")])]);
  await assert.rejects(() => plugin.resolve("ep:1396:1:1"), (e) => e.code === "not_found" && e.userMessage === "No se encontraron fuentes para este episodio.");
});

test("a show TMDB does not know, a missing page or an unknown ref are not_found", async () => {
  tmdbImpl = async () => null;
  await assert.rejects(() => plugin.resolve("ep:999:1:1"), (e) => e.code === "not_found" && e.userMessage === "No se encontró información de esta serie.");
  serve("breaking-bad", 1, 1);
  await assert.rejects(() => plugin.resolve("ep:1396:9:9"), (e) => e.code === "not_found");
  await assert.rejects(() => plugin.resolve("nonsense"), (e) => e.code === "not_found");
  await assert.rejects(() => plugin.resolve("m:603"), (e) => e.code === "not_found");
});

// ---- the catalog: series only ----

const GENRES = ["peliculas", "series", "anime", "infantil", "documentales", "deportes", "noticias", "musica", "entretenimiento", "otros"];
const titles = (n, withPoster = true) => Array.from({ length: n }, (_, i) => ({ id: 1000 + i, name: "T" + i, first_air_date: "2024-01-01", genre_ids: [18, 10759], ...(withPoster ? { poster_path: "/p" + i + ".jpg" } : {}) }));

test("the Home is series only: every row is a TV list, with a genre Kino knows, a ref to browse, and titles carrying their genres", async () => {
  tmdbImpl = async () => ({ results: titles(40), page: 1, total_pages: 5 });
  const rows = await plugin.home();
  assert.ok(rows.length >= 10 && rows.length <= 20, "rows: " + rows.length);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  for (const r of rows) {
    assert.ok(GENRES.includes(r.genre), r.id);
    assert.ok(r.ref && r.title && r.items.length > 0 && r.items.length <= 20, r.id);
    assert.ok(r.items.every((i) => i.kind === "series" && i.poster && i.ref.startsWith("s:") && i.genres.includes("Drama")));
  }
  assert.ok(tmdbCalls.every((c) => /\/tv|\/discover\/tv|\/trending\/tv/.test(c.path)), "no movie list is asked");
  assert.ok(tmdbCalls.length <= 20);
  assert.ok(rows.some((r) => r.genre === "anime") && rows.some((r) => r.genre === "infantil") && rows.some((r) => r.genre === "documentales"));
});

test("a row that fails or has no posters is left out; with none, a readable error", async () => {
  tmdbImpl = async (path) => { if (path === "/tv/on_the_air") throw new Error("boom"); if (path === "/tv/top_rated") return { results: titles(5, false) }; return { results: titles(5) }; };
  const rows = await plugin.home();
  assert.ok(!rows.some((r) => r.id === "on-the-air" || r.id === "top-series") && rows.length >= 8);
  tmdbImpl = async () => { throw new Error("down"); };
  await assert.rejects(() => plugin.home(), (e) => e.code === "unavailable" && e.userMessage === "El servicio no está disponible en este momento.");
});

test("rows are named in the person's language", async () => {
  tmdbImpl = async () => ({ results: titles(3) });
  globalThis.kino.lang = "en";
  try { assert.equal((await plugin.home())[0].title, "Trending series"); } finally { globalThis.kino.lang = "es"; }
});

test("every row's ref opens its own TV list in Ver más, page after page; movie refs open nothing", async () => {
  tmdbImpl = async (path, params) => ({ results: titles(30), page: params.page, total_pages: 3 });
  for (const row of await plugin.home()) {
    tmdbCalls.length = 0;
    const first = await plugin.browse(row.ref, null);
    assert.ok(first.items.length > 0, row.ref);
    assert.equal(first.next, "2", row.ref);
    assert.ok(/\/tv|\/discover\/tv|\/trending\/tv/.test(tmdbCalls[0].path), row.ref + " -> " + tmdbCalls[0].path);
    assert.equal((await plugin.browse(row.ref, "3")).next, undefined);
  }
  for (const ref of ["nonsense", "list:tv:../account", "genre:movie:28", "trend:movie", "list:movie:top_rated"]) assert.deepEqual(await plugin.browse(ref, null), { items: [] }, ref);
});

test("search is series only: a movie search is empty, the others ask TV", async () => {
  tmdbImpl = async () => ({ results: [{ id: 1396, name: "Breaking Bad", poster_path: "/b.jpg", first_air_date: "2008-01-20" }] });
  globalThis.kino.rank = { filterRelevant: (items) => items, sortBySimilarity: (items) => items };
  try {
    assert.deepEqual(await plugin.search({ q: "breaking", type: "movie" }), []);
    assert.deepEqual(await plugin.search({ q: " ", type: "series" }), []);
    const out = await plugin.search({ q: "breaking", type: "any" });
    assert.equal(out[0].ref, "s:1396");
    assert.equal(tmdbCalls.at(-1).path, "/search/tv");
  } finally { globalThis.kino.rank = {}; }
});

test("the categories are TMDB's TV genres, each browsable as genre:tv:<id>", async () => {
  tmdbImpl = async () => ({ genres: [{ id: 10759, name: "Action & Adventure" }, { id: 18, name: "Drama" }] });
  const cats = await plugin.categories();
  assert.deepEqual(cats.map((c) => c.ref), ["genre:tv:10759", "genre:tv:18"]);
  assert.deepEqual(cats.map((c) => c.title), ["Action & Adventure", "Drama"]);
  assert.equal(tmdbCalls[0].path, "/genre/tv/list");
  assert.equal(new Set(cats.map((c) => c.id)).size, cats.length);
});

test("the episodes carry the TMDB id in their refs, which is what resolve needs", async () => {
  metaImpl = async (q) => (q.ids.tmdb === 1396 ? { title: "Breaking Bad", ids: { tmdb: 1396 }, episodes: [{ season: 1, number: 1, title: "Pilot" }, { season: 2, number: 5, title: "Breakage" }] } : null);
  const out = await plugin.episodes("s:1396");
  assert.deepEqual(out.episodes.map((e) => e.ref), ["ep:1396:1:1", "ep:1396:2:5"]);
  await assert.rejects(() => plugin.episodes("s:5"), (e) => e.code === "not_found" && e.userMessage === "No se encontró información de esta serie.");
});

test("the cache action empties only the cached shows", async () => {
  kino.storage.set("show:1", "{}"); kino.storage.set("other", "{}"); kino.storage.set("show:2", "{}");
  assert.equal((await plugin.action("clearCache")).message, "Caché de títulos vaciada.");
  assert.deepEqual([...store.keys()], ["other"]);
});
