// node --test test/plugin.test.mjs
// Offline: a fake seriesflixhd.boats (episode pages with language blocks), a stubbed kino-resolver door and a stub of `kino`.
// Seriesflix no longer runs its own hoster extractors: every copy's embed goes to the shared kino-resolver through
// `kino.plugins.call("resolver", "resolve", …)`, stubbed here. What the door returns for an embed is the stream Seriesflix
// plays; this file tests Seriesflix's own work around it (finding the show's page, listing and ordering copies, the lazy
// alternatives, the install gate and the WebView capture fallback) — the extractors themselves are the resolver's to test.
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

// ---- the shared kino-resolver door, stubbed ----
// `resolverUp` toggles whether the provider is installed (normalizeHost); `door(url, referer)` decides what `resolve`
// returns for an embed (default: an hls per known host); `doorCalls` records the embeds asked, in order.
let resolverUp = true;
let doorCalls = [];
let door = null;
const defaultDoor = (url) => {
  if (/voe\.sx/.test(url)) return { streams: [{ url: "https://cdn.test/voe/master.m3u8", kind: "hls", server: "voe", referer: "https://voe.sx/" }] };
  if (/nupload/.test(url)) { const id = url.split("/").pop(); return { streams: [{ url: `https://cdn.test/nup/${id}.m3u8`, kind: "hls", server: "nupload", referer: "https://nupload.my/" }] }; }
  return { streams: [] };
};

globalThis.kino = {
  lang: "es",
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
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
  plugins: {
    call: async (alias, method, args = {}) => {
      if (alias !== "resolver") throw kino.error("not_declared", "no provider " + alias);
      if (method === "normalizeHost") {
        if (!resolverUp) throw kino.error("provider_missing", "the resolver is not installed");
        let host = ""; try { host = new URL(args.url).host; } catch (_) { host = ""; }
        return { host };
      }
      if (method === "resolve") { doorCalls.push(args.url); return (door || defaultDoor)(args.url, args.referer); }
      throw kino.error("not_declared", method);
    },
  },
};
const plugin = await import("../plugin.js");

beforeEach(() => {
  calls.length = 0; tmdbCalls.length = 0; logs = []; config = {}; pages = {}; store = new Map();
  delete globalThis.kino.browser; metaImpl = async () => null; tmdbImpl = async () => ({ results: [] });
  resolverUp = true; doorCalls = []; door = null;
});

const SITE = "https://seriesflixhd.boats";
const b64 = (s) => Buffer.from(s).toString("base64");

/** TMDB's answer for a show: titles in es-MX, with the es-ES and en translations, and the years of its run. */
const SHOW = (over = {}) => ({ id: 1396, name: "Breaking Bad", original_name: "Breaking Bad", first_air_date: "2008-01-20", last_air_date: "2013-09-29", in_production: false,
  translations: { translations: [{ iso_3166_1: "ES", data: { name: "Breaking Bad" } }, { iso_3166_1: "US", data: { name: "Breaking Bad" } }] }, ...over });

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
/** The site's page for an episode; TMDB answers the show's names. The copies' embeds go to the stubbed door, not fetched here. */
function serve(slug, season, episode, blocks = BLOCKS, extra = {}) {
  pages = { [`${SITE}/episodio/${slug}-${season}x${episode}`]: { body: episodePage(blocks) }, ...extra };
  tmdbImpl = async (path) => (path === "/tv/1396" ? SHOW() : { results: [] });
}

const manifest = JSON.parse(readFileSync(new URL("../kino-plugin.json", import.meta.url), "utf8"));

test("the manifest is valid for Kino, declares the site, its old names and the players, consumes the resolver, and is series only", () => {
  const out = validateManifest(readFileSync(new URL("../kino-plugin.json", import.meta.url), "utf8"));
  assert.ok(!out.errors?.length, JSON.stringify(out.errors));
  for (const h of ["seriesflixhd.boats", "seriesflixhd.pw", "seriesflixhd.casa", "seriesflixhd.best", "nupload.my", "nupload.me", "voe.sx"]) assert.ok(manifest.hosts.includes(h), h);
  assert.deepEqual(manifest.categories, ["series"]);
  assert.ok(manifest.capabilities.includes("download"));
  assert.ok(manifest.capabilities.includes("screen"));
  assert.equal(manifest.consumes?.resolver?.repo, "xuper-plugin/kino-plugin-kino-resolver");
});

test("an episode finds the show's page by its title, plays the first copy the resolver opens (Latino on nupload) and keeps the rest lazy", async () => {
  serve("breaking-bad", 1, 1);
  const a = await plugin.resolve("ep:1396:1:1");
  assert.ok(calls.some((c) => c.url === `${SITE}/episodio/breaking-bad-1x1`));
  assert.equal(doorCalls[0], "https://nupload.my/watch/lat");
  assert.equal(a.url, "https://cdn.test/nup/lat.m3u8");
  assert.equal(a.label, "Latino · Nupload");
  assert.equal(a.mime, "application/vnd.apple.mpegurl");
  assert.equal(a.headers.Referer, "https://nupload.my/");
  assert.match(a.headers["User-Agent"], /Mozilla/);
  assert.deepEqual(a.alternatives.map((x) => x.label), ["Latino · Voe", "Castellano · Nupload", "Subtitulado · Nupload"]);
  assert.deepEqual(a.alternatives.map((x) => x.ref), ["cp:1396:1:1:lat:voe", "cp:1396:1:1:esp:nupload", "cp:1396:1:1:sub:nupload"]);
  assert.ok(a.alternatives.every((x) => x.ref.length <= 512 && !x.url));
});

test("without the resolver installed, resolve asks to install the playback engine (and never names the brand in the message)", async () => {
  serve("breaking-bad", 1, 1);
  resolverUp = false;
  await assert.rejects(() => plugin.resolve("ep:1396:1:1"), (e) => e.code === "unavailable" && /motor de reproducci/.test(e.userMessage) && !/kino/i.test(e.userMessage));
});

test("every request to the site carries a browser User-Agent (the site answers okhttp's with another page)", async () => {
  serve("breaking-bad", 1, 1);
  await plugin.resolve("ep:1396:1:1");
  assert.ok(calls.length >= 1);
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
  pages = { [`${SITE}/episodio/lost-1x1`]: { body: episodePage(BLOCKS) } };
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
  assert.equal(a.url, "https://cdn.test/nup/esp.m3u8");
  assert.equal(a.label, "Castellano · Nupload");
  assert.equal(a.alternatives, undefined);
  await assert.rejects(() => plugin.resolve("cp:1396:2:5:sub:voe"), (e) => e.code === "not_found" && e.userMessage === "No se encontraron fuentes para este episodio.");
  await assert.rejects(() => plugin.resolve("cp:garbage"), (e) => e.code === "not_found");
});

test("a nupload link that wraps Voe is unwrapped, and the unwrapped Voe embed is what goes to the door", async () => {
  serve("breaking-bad", 1, 1);
  const a = await plugin.resolve("cp:1396:1:1:lat:voe");
  assert.equal(doorCalls[0], "https://voe.sx/e/voelat"); // the inner address, not the nupload/iframe wrapper
  assert.equal(a.url, "https://cdn.test/voe/master.m3u8");
  assert.equal(a.label, "Latino · Voe");
});

test("a gated copy (the door returns no stream) cannot open without the hidden browser; with it, the WebView capture plays", async () => {
  serve("breaking-bad", 1, 1);
  door = (url) => (/voe\.sx/.test(url) ? { streams: [], error: "needs_browser" } : defaultDoor(url));
  await assert.rejects(() => plugin.resolve("cp:1396:1:1:lat:voe"), (e) => e.code === "not_found");
  globalThis.kino.browser = { capture: async () => ({ media: [{ url: "https://cdn.test/captured/master.m3u8" }] }) };
  assert.equal((await plugin.resolve("cp:1396:1:1:lat:voe")).url, "https://cdn.test/captured/master.m3u8");
});

test("a copy the door cannot open is skipped: the next one plays, and the failed one is not offered again", async () => {
  serve("breaking-bad", 1, 1);
  // Latino fails on both its servers (nupload empty, voe gated with no browser); Castellano plays.
  door = (url) => (/\/watch\/lat$/.test(url) || /voe\.sx\/e\/voelat/.test(url) ? { streams: [] } : defaultDoor(url));
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
