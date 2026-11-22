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
var SITE = "https://seriesflixhd.boats";
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

// src/browse/model.js
var MAX_SLIDES = 6;
var MAX_RAILS = 8;
var MAX_RAIL_ITEMS = 20;
var MAX_SLIDE_TEXT = 160;
var HTTPS = /^https:\/\//;
function cardOf(item) {
  const out = { id: item.id, ref: item.ref, title: item.title, kind: item.kind };
  if (item.poster && HTTPS.test(item.poster)) out.poster = item.poster;
  if (item.backdrop && HTTPS.test(item.backdrop)) out.backdrop = item.backdrop;
  if (item.year !== void 0) out.year = item.year;
  if (item.lang) out.lang = item.lang;
  return out;
}
function slidesOf(rows2) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const row of rows2) {
    for (const item of row.items) {
      if (out.length >= MAX_SLIDES) return out;
      const image = item.backdrop && HTTPS.test(item.backdrop) ? item.backdrop : item.poster;
      if (seen.has(item.id) || !image || !HTTPS.test(image)) continue;
      const text = typeof item.overview === "string" ? item.overview.trim() : "";
      if (text === "") continue;
      seen.add(item.id);
      out.push({ id: item.id, ref: item.ref, kind: item.kind, title: item.title, image, text: text.length <= MAX_SLIDE_TEXT ? text : `${text.slice(0, MAX_SLIDE_TEXT - 1).trimEnd()}\u2026` });
    }
  }
  return out;
}
function railsOf(rows2) {
  return rows2.filter((r) => !r.hidden && r.items && r.items.length > 0).slice(0, MAX_RAILS).map((r) => ({
    id: r.id,
    title: r.title,
    ...r.titleEn ? { titleEn: r.titleEn } : {},
    ...r.ref ? { ref: r.ref } : {},
    items: r.items.slice(0, MAX_RAIL_ITEMS).map(cardOf)
  }));
}
function tabOf(page) {
  const rows2 = page && Array.isArray(page.rows) ? page.rows : [];
  const rails = railsOf(rows2);
  if (rails.length === 0) return null;
  return { slides: slidesOf(rows2), rails };
}
function recentOf(keys, tabs) {
  if (keys.length === 0) return [];
  const byRef = /* @__PURE__ */ new Map();
  for (const data of tabs) for (const rail2 of data.rails) for (const card of rail2.items) if (!byRef.has(card.ref)) byRef.set(card.ref, card);
  const out = [];
  const used = /* @__PURE__ */ new Set();
  for (const key of keys) {
    const card = byRef.get(key);
    if (card && !used.has(card.id)) {
      used.add(card.id);
      out.push(card);
    }
  }
  return out;
}

// src/i18n.js
var T = {
  brWatch: ["Ver ahora", "Watch now"],
  brInfo: ["M\xE1s informaci\xF3n", "More info"],
  brRecent: ["Continuar viendo", "Continue watching"],
  brEmpty: ["No hay t\xEDtulos para mostrar ahora.", "There is nothing to show right now."],
  brFailed: ["No se pudo cargar esta secci\xF3n. Revisa tu conexi\xF3n.", "This section could not be loaded. Check your connection."],
  brRetry: ["Reintentar", "Retry"],
  brClose: ["Cerrar", "Close"],
  brBack: ["Atr\xE1s", "Back"],
  brSearch: ["Buscar", "Search"],
  brSettings: ["Ajustes", "Settings"],
  brSearchHint: ["Escribe un t\xEDtulo", "Type a title"],
  brSearchTitle: ["Buscar", "Search"],
  brSearchFailed: ["La b\xFAsqueda no respondi\xF3. Intenta de nuevo.", "The search did not answer. Try again."],
  brNoResults: ["No encontramos nada con esas palabras.", "Nothing matched those words."],
  brSearchedBefore: ["Buscados antes", "Searched before"],
  noServer: ["Esta pel\xEDcula no tiene ahora un servidor que abra. Intenta de nuevo m\xE1s tarde.", "This movie has no server that opens right now. Try again later."],
  siteDown: ["El cat\xE1logo no responde ahora. Intenta de nuevo en un rato.", "The catalog is not answering right now. Try again in a moment."]
};
function both(key, vars = {}) {
  const pair = T[key] || [key, key];
  const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => k in vars ? String(vars[k]) : "");
  return { es: fill(pair[0]), en: fill(pair[1]) };
}

// src/browse/view.js
var POLL_MS = 1500;
var SEARCH_CAP = 60;
var twin = (key, field = "text", vars) => {
  const w = both(key, vars);
  return { [field]: w.es, [field + "En"]: w.en };
};
var tabLabel = (tab) => ({ label: tab.es, labelEn: tab.en });
var railSkeleton = (n) => ({
  type: "Column",
  key: "skel" + n,
  gap: 8,
  children: [
    { type: "Skeleton", shape: "line", width: 120 },
    { type: "Row", gap: 12, sizes: ["compact"], children: [1, 2, 3].map((i) => ({ type: "Skeleton", shape: "card", key: `sk${n}c${i}`, flex: 1 })) },
    { type: "Row", gap: 12, sizes: ["medium", "expanded"], children: [1, 2, 3, 4, 5, 6].map((i) => ({ type: "Skeleton", shape: "card", key: `sk${n}w${i}`, flex: 1 })) }
  ]
});
var gridSkeleton = () => ({
  type: "Column",
  key: "gridSkeleton",
  gap: 12,
  children: [
    ...[1, 2].map((r) => ({ type: "Row", gap: 12, sizes: ["compact"], key: `gc${r}`, children: [1, 2, 3].map((i) => ({ type: "Skeleton", shape: "card", key: `gc${r}-${i}`, flex: 1 })) })),
    ...[1, 2].map((r) => ({ type: "Row", gap: 12, sizes: ["medium", "expanded"], key: `gw${r}`, children: [1, 2, 3, 4, 5, 6].map((i) => ({ type: "Skeleton", shape: "card", key: `gw${r}-${i}`, flex: 1 })) }))
  ]
});
var heroSkeleton = () => ({ type: "Skeleton", key: "heroSkeleton", shape: "block", height: { compact: 200, expanded: 320 } });
var slideNode = (s, canPlay) => ({
  type: "heroCard",
  key: "slide-" + s.id,
  h: { compact: 200, expanded: 240 },
  ...s.logo ? { logo: s.logo } : {},
  title: s.title,
  text: s.text,
  image: s.image,
  buttons: canPlay ? [
    { type: "ElevatedButton", key: "watch-" + s.id, ...twin("brWatch", "labelText"), icon: "play", onPressed: { go: { play: { ref: s.ref, kind: s.kind, id: s.id, title: s.title } } } },
    { type: "TextButton", key: "info-" + s.id, ...twin("brInfo", "labelText"), onPressed: { go: { title: { ref: s.ref, kind: s.kind, id: s.id, title: s.title } } } }
  ] : [
    { type: "ElevatedButton", key: "watch-" + s.id, ...twin("brWatch", "labelText"), icon: "play", onPressed: { go: { title: { ref: s.ref, kind: s.kind, id: s.id, title: s.title } } } }
  ]
});
var hero = (slides, canPlay) => slides.length === 1 ? slideNode(slides[0], canPlay) : { type: "PageView", key: "hero" + slides.length, autoPlayMs: 6e3, children: slides.map((x) => slideNode(x, canPlay)) };
var rail = (r, key, titleOverride) => ({
  type: "titleRail",
  key,
  ...titleOverride || { title: r.title, ...r.titleEn ? { titleEn: r.titleEn } : {} },
  ...r.ref ? { ref: r.ref } : {},
  items: r.items,
  size: "medium"
});
var brandNode = (brand) => ({ type: "Text", key: "logo", text: brand, textEn: brand, style: "h4" });
var tabBar = (tabs, active) => ({ type: "TabBar", key: "tabs", divider: false, value: active, onChanged: "tab", tabs: tabs.map((t2) => ({ value: t2.id, ...tabLabel(t2) })) });
function browseView({ brand, tabs, tab, data, recent, pending, failed, canPlay = false, device = "phone" }) {
  const tv = device === "tv";
  const active = tabs.some((t2) => t2.id === tab) ? tab : tabs[0].id;
  const body = [];
  if (data) {
    if (data.slides.length > 0) body.push(hero(data.slides, canPlay));
    if (recent.length > 0) body.push(rail({ items: recent }, "recent", twin("brRecent", "title")));
    for (const r of data.rails) body.push(rail(r, "rail-" + String(r.id).replace(/[^A-Za-z0-9_-]/g, "_")));
    if (data.rails.length === 0) body.push({ type: "Text", ...twin("brEmpty", "text"), color: "muted" });
  } else if (failed) {
    body.push({ type: "MaterialBanner", key: "loadFailed", role: "error", ...twin("brFailed"), action: { ...twin("brRetry", "label"), onTap: "retry" } });
  } else {
    body.push(heroSkeleton(), railSkeleton(1), railSkeleton(2), railSkeleton(3));
  }
  const gear = { type: "IconButton", key: "settingsButton", icon: "settings", ...twin("brSettings", "labelText"), ...twin("brSettings", "tooltip"), onPressed: { event: "go", arg: "settings" } };
  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      mergeWithKinoBar: true,
      dense: true,
      divider: false,
      leading: { type: "IconButton", key: "close", icon: "close", ...twin("brClose", "labelText"), ...twin("brClose", "tooltip"), onPressed: { go: { close: true } } },
      // On a TV the search is a button of the bar (a floating one is hard to reach with a remote); elsewhere it floats.
      actions: tv ? [{ type: "IconButton", key: "searchButton", icon: "search", ...twin("brSearch", "labelText"), ...twin("brSearch", "tooltip"), onPressed: "openSearch" }, gear] : [gear],
      // On a TV the tabs sit in the bar beside the name (one row, one D-pad strip); elsewhere they are pinned under it.
      title: tv ? { type: "Row", key: "titleRow", gap: 24, crossAxisAlignment: "center", children: [brandNode(brand), tabBar(tabs, active)] } : brandNode(brand)
    },
    ...tv ? {} : { floatingActionButton: { type: "FloatingActionButton", key: "searchFab", icon: "search", ...twin("brSearch", "tooltip"), onPressed: "openSearch" } },
    body: { type: "Column", key: "page", children: [
      ...tv ? [] : [{ type: "Column", key: "tabsRow", padding: { compact: 0, expanded: 24 }, children: [tabBar(tabs, active)] }],
      { type: "SingleChildScrollView", key: "browse-" + active, flex: 1, children: [{ type: "Column", padding: { compact: 12, expanded: 24 }, gap: 16, children: body }] }
    ] },
    ...pending ? { every: { ms: POLL_MS, event: "tick" } } : {}
  };
}
function searchView({ query, status, items, history = [], device = "phone" }) {
  const tv = device === "tv";
  const searchForm = () => ({
    type: "Form",
    key: "searchForm",
    onSubmitted: "search",
    gap: 8,
    children: tv ? [{ type: "Row", key: "searchRow", gap: 16, crossAxisAlignment: "center", children: [
      { type: "TextField", key: "q", kind: "text", value: query, ...twin("brSearchHint", "labelText"), maxLength: 100, autofocus: true, weight: 1 },
      { type: "ElevatedButton", key: "searchGo", ...twin("brSearch", "labelText"), icon: "search", submit: true }
    ] }] : [
      { type: "TextField", key: "q", kind: "text", value: query, ...twin("brSearchHint", "labelText"), maxLength: 100, autofocus: true },
      { type: "ElevatedButton", key: "searchGo", ...twin("brSearch", "labelText"), icon: "search", submit: true }
    ]
  });
  const body = tv ? [] : [searchForm()];
  if (status === "fail") {
    body.push({ type: "MaterialBanner", key: "searchFailed", role: "error", ...twin("brSearchFailed"), action: { ...twin("brRetry", "label"), onTap: "sretry" } });
  } else if (status === "done" && items) {
    if (items.length === 0) body.push({ type: "Text", ...twin("brNoResults", "text"), color: "muted" });
    else body.push({ type: "titleGrid", key: "results", columns: { compact: 3, expanded: 6 }, items: items.slice(0, SEARCH_CAP) });
  } else if (status !== "idle") {
    body.push(gridSkeleton());
  } else if (history.length > 0) {
    body.push({ type: "Text", ...twin("brSearchedBefore", "text"), style: "h4" });
    body.push({ type: "titleGrid", key: "history", columns: { compact: 3, expanded: 6 }, items: history.slice(0, SEARCH_CAP) });
  }
  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      mergeWithKinoBar: true,
      dense: true,
      divider: false,
      leading: { type: "IconButton", key: "back", icon: "arrow_back", ...twin("brBack", "labelText"), ...twin("brBack", "tooltip"), onPressed: "back" },
      ...tv ? { title: searchForm() } : twin("brSearchTitle", "title")
    },
    body: { type: "SingleChildScrollView", key: "search-page", children: [{ type: "Column", padding: { compact: 12, expanded: 24 }, gap: 16, children: body }] },
    ...status === "loading" ? { every: { ms: 1e3, event: "stick" } } : {}
  };
}
function settingsView({ brand }) {
  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      mergeWithKinoBar: true,
      dense: true,
      divider: false,
      leading: { type: "IconButton", key: "back", icon: "arrow_back", ...twin("brBack", "labelText"), ...twin("brBack", "tooltip"), onPressed: "back" },
      title: brandNode(brand)
    },
    body: { type: "SingleChildScrollView", key: "settings-page", children: [{ type: "Column", padding: { compact: 12, expanded: 24 }, gap: 16, children: [{ type: "settings", key: "form" }] }] }
  };
}

// src/browse/metaCache.js
var KEY = "meta1";
var MAX = 120;
var CALL_MS = 8e3;
var HTTPS2 = /^https:\/\//;
function makeMetaCache({ kino: kino2, titleOf = (c) => c.title, clock = { now: () => Date.now() } }) {
  const usable = () => {
    try {
      return typeof kino2.meta === "function" && kino2.meta.byTitle === true;
    } catch (_) {
      return false;
    }
  };
  let book = null;
  function read() {
    if (book) return book;
    try {
      const o = JSON.parse(kino2.storage.get(KEY) || "null");
      book = o && typeof o === "object" && !Array.isArray(o) ? o : {};
    } catch (_) {
      book = {};
    }
    return book;
  }
  function write() {
    try {
      const ids = Object.keys(book);
      if (ids.length > MAX) for (const id of ids.slice(0, ids.length - MAX)) delete book[id];
      kino2.storage.set(KEY, JSON.stringify(book));
    } catch (_) {
    }
  }
  function known(id) {
    const e = read()[id];
    if (!e) return {};
    return { ...e.t > 0 ? { tmdb: e.t } : {}, ...e.l && HTTPS2.test(e.l) ? { logo: e.l } : {} };
  }
  function dress(cards) {
    return cards.map((c) => {
      const k = known(c.id);
      return k.tmdb && !(c.ids && c.ids.tmdb) ? { ...c, ids: { ...c.ids || {}, tmdb: k.tmdb } } : c;
    });
  }
  async function fill(cards, budgetMs) {
    if (!usable()) return 0;
    const b = read();
    const end = clock.now() + budgetMs;
    let asked = 0;
    for (const c of cards) {
      if (clock.now() + CALL_MS > end) break;
      if (!c || typeof c.id !== "string" || Object.hasOwn(b, c.id) || c.ids && c.ids.tmdb && c.noLogo) continue;
      const year = c.year !== void 0 ? { year: c.year } : {};
      try {
        const a = await kino2.meta({ type: c.kind === "series" ? "series" : "movie", title: titleOf(c), ...year });
        b[c.id] = { t: a && a.ids && Number.isInteger(a.ids.tmdb) ? a.ids.tmdb : 0, l: a && typeof a.logo === "string" ? a.logo : "" };
      } catch (e) {
        if (e && e.code === "rate_limited") break;
        continue;
      }
      asked++;
    }
    if (asked > 0) write();
    return asked;
  }
  return { known, dress, fill, usable };
}

// src/browse/index.js
var SNAP_TTL_MS = 12 * 3600 * 1e3;
var SNAP_MAX = 20 * 1024;
var RECENT_MAX = 12;
var HIST_MAX = 24;
function makeBrowse({ kino: kino2, brand, tabs, loadTab, searchTitles, canPlay = false, titleOf }) {
  const TAB_IDS = tabs.map((t2) => t2.id);
  const TAB_KEY = "browseTab";
  const SNAP_PREFIX = "browse1:";
  const RECENT_KEY = "recent1";
  const HIST_KEY = "searchHist1";
  const meta = makeMetaCache({ kino: kino2, titleOf });
  const enrich = (data) => data ? {
    slides: data.slides.map((s) => {
      const k = meta.known(s.id);
      return k.logo ? { ...s, logo: k.logo } : s;
    }),
    rails: data.rails.map((r) => ({ ...r, items: meta.dress(r.items) }))
  } : data;
  const memo = /* @__PURE__ */ new Map();
  const log = (...a) => {
    try {
      kino2.log("[" + brand + "]", ...a);
    } catch (_) {
    }
  };
  const get = (k) => {
    try {
      return kino2.storage.get(k);
    } catch (_) {
      return null;
    }
  };
  const set = (k, v, opts) => {
    try {
      kino2.storage.set(k, v, opts);
    } catch (_) {
    }
  };
  function readSnap(tab) {
    try {
      const o = JSON.parse(get(SNAP_PREFIX + tab) || "null");
      return o && Date.now() - o.at < SNAP_TTL_MS && o.data && Array.isArray(o.data.rails) ? o.data : null;
    } catch (_) {
      return null;
    }
  }
  function writeSnap(tab, data) {
    for (let per = 10; per >= 3; per -= 2) {
      const slim2 = { slides: data.slides, rails: data.rails.map((r) => ({ ...r, items: r.items.slice(0, per) })) };
      const text = JSON.stringify({ at: Date.now(), data: slim2 });
      if (text.length <= SNAP_MAX) {
        set(SNAP_PREFIX + tab, text, { ttlMs: SNAP_TTL_MS });
        return;
      }
    }
  }
  const stored = () => {
    const t2 = get(TAB_KEY);
    return TAB_IDS.includes(t2) ? t2 : null;
  };
  const remember = (tab) => set(TAB_KEY, tab);
  function dataOf(tab) {
    if (memo.has(tab)) return memo.get(tab).data;
    const snap = readSnap(tab);
    if (snap) {
      memo.set(tab, { data: snap, whole: false });
      return snap;
    }
    return null;
  }
  const readKeys = () => {
    try {
      const a = JSON.parse(get(RECENT_KEY) || "[]");
      return Array.isArray(a) ? a.filter((k) => typeof k === "string") : [];
    } catch (_) {
      return [];
    }
  };
  function notePlayed(ref) {
    try {
      const key = String(ref || "");
      if (key === "") return;
      const keys = readKeys();
      if (keys[0] === key) return;
      set(RECENT_KEY, JSON.stringify([key, ...keys.filter((k) => k !== key)].slice(0, RECENT_MAX)));
    } catch (_) {
    }
  }
  const slim = (c) => ({ id: c.id, ref: c.ref, title: c.title, kind: c.kind, ...c.poster ? { poster: c.poster } : {} });
  function readHistory() {
    try {
      const a = JSON.parse(get(HIST_KEY) || "[]");
      return Array.isArray(a) ? a.filter((c) => c && typeof c.id === "string" && typeof c.ref === "string" && typeof c.title === "string").slice(0, HIST_MAX) : [];
    } catch (_) {
      return [];
    }
  }
  function rememberFound(cards) {
    try {
      const fresh = cards.slice(0, 12).map(slim);
      const ids = new Set(fresh.map((c) => c.id));
      set(HIST_KEY, JSON.stringify([...fresh, ...readHistory().filter((c) => !ids.has(c.id))].slice(0, HIST_MAX)));
    } catch (_) {
    }
  }
  let found = null;
  const tabFromArgs = (route) => {
    const a = route && route.args && typeof route.args === "object" ? route.args : {};
    return TAB_IDS.includes(a.tab) ? a.tab : null;
  };
  function needed(tab, device) {
    const order = [tab, ...TAB_IDS.filter((t2) => t2 !== tab)];
    return order.filter((t2, i) => (i === 0 || device !== "tv") && !(memo.get(t2) && memo.get(t2).whole));
  }
  function view(ctx) {
    const st = ctx.state && typeof ctx.state === "object" ? ctx.state : {};
    if (ctx.route && ctx.route.name === "settings") return settingsView({ brand });
    if (ctx.route && ctx.route.name === "search") {
      const query = typeof st.sq === "string" ? st.sq : "";
      const items = found && found.q === query ? found.items : null;
      const status = query === "" ? "idle" : st.sstate === "fail" ? "fail" : items ? "done" : "loading";
      return searchView({ query, status, items, history: query === "" ? readHistory() : [], device: ctx.device });
    }
    const tab = TAB_IDS.includes(st.tab) ? st.tab : tabFromArgs(ctx.route) ?? stored() ?? TAB_IDS[0];
    const data = enrich(dataOf(tab));
    const loaded = TAB_IDS.map((t2) => memo.get(t2)).filter(Boolean).map((m) => m.data);
    const pending = Array.isArray(st.pending) && st.pending.length > 0;
    return browseView({ brand, tabs, tab, data, recent: meta.dress(recentOf(readKeys(), loaded)), pending, failed: !!(st.failed && st.failed[tab]), canPlay, device: ctx.device });
  }
  async function load(tab) {
    const page = await loadTab(tab);
    const data = tabOf(page);
    if (data) {
      memo.set(tab, { data, whole: true });
      writeSnap(tab, data);
    }
    return data !== null;
  }
  const events = {
    open({ route, state, device }) {
      const tab = tabFromArgs(route) ?? (TAB_IDS.includes(state.tab) ? state.tab : stored() ?? TAB_IDS[0]);
      for (const t2 of TAB_IDS) dataOf(t2);
      return { state: { tab, pending: needed(tab, device), failed: null } };
    },
    tab({ value, arg, state }) {
      const tab = TAB_IDS.includes(value) ? value : TAB_IDS.includes(arg) ? arg : null;
      if (!tab) return null;
      remember(tab);
      dataOf(tab);
      const failed = { ...state.failed || {} };
      delete failed[tab];
      const pending = [tab, ...Array.isArray(state.pending) ? state.pending.filter((t2) => t2 !== tab) : []];
      return { state: { tab, pending: memo.get(tab) && memo.get(tab).whole ? pending.slice(1) : pending, failed } };
    },
    retry({ state, device }) {
      const tab = TAB_IDS.includes(state.tab) ? state.tab : TAB_IDS[0];
      return { state: { failed: null, pending: [tab, ...needed(tab, device).filter((t2) => t2 !== tab)] } };
    },
    async tick({ state }) {
      const pending = Array.isArray(state.pending) ? state.pending : [];
      if (pending.length === 0) return null;
      const [next, ...rest] = pending;
      const failed = { ...state.failed || {} };
      if (next.startsWith("meta:")) {
        const m = memo.get(next.slice(5));
        if (m) await meta.fill([...m.data.slides.map((s) => ({ id: s.id, title: s.title, kind: s.kind })), ...m.data.rails.flatMap((r) => r.items.slice(0, 6).map((c) => ({ id: c.id, title: c.title, kind: c.kind })))], 12e3);
        return { state: { pending: rest } };
      }
      try {
        const ok = await load(next);
        if (!ok) failed[next] = true;
        else delete failed[next];
        if (ok && meta.usable()) rest.unshift("meta:" + next);
      } catch (e) {
        log("browse tab", e && e.code || "error");
        failed[next] = true;
      }
      return { state: { pending: rest, failed } };
    },
    // The floating button: straight to the search page, empty and ready for the words.
    openSearch() {
      return { route: { push: "search" }, state: { sq: "", sstate: null } };
    },
    search({ value, route }) {
      const q = value && typeof value.q === "string" ? value.q.trim().slice(0, 100) : "";
      if (q === "") return null;
      const state = { sq: q, sstate: "loading" };
      return route && route.name === "search" ? { state } : { route: { push: "search" }, state };
    },
    // The search page's timer: one search per press, then no timer.
    async stick({ state }) {
      const q = typeof state.sq === "string" ? state.sq : "";
      if (q === "" || state.sstate !== "loading") return null;
      try {
        const out = await searchTitles(q);
        found = { q, items: (Array.isArray(out) ? out : []).slice(0, 60).map(cardOf) };
        rememberFound(found.items);
        return { state: { sstate: "done" } };
      } catch (e) {
        log("browse search", e && e.code || "error");
        return { state: { sstate: "fail" } };
      }
    },
    sretry({ state }) {
      return typeof state.sq === "string" && state.sq !== "" ? { state: { sstate: "loading" } } : null;
    },
    // The gear: the plugin's settings are a page of their own, one Back away.
    go({ arg }) {
      return arg === "settings" ? { route: { push: "settings" }, state: { fromBrowse: true } } : null;
    },
    back({ state, route }) {
      if (route && route.name === "settings" && !state.fromBrowse) return { close: true };
      return { route: { pop: true }, state: { sq: null, sstate: null } };
    }
  };
  async function event(ev) {
    const handler = Object.hasOwn(events, ev.name) ? events[ev.name] : null;
    return handler ? await handler({ ...ev, state: ev.state || {} }) ?? null : null;
  }
  return { view, event, notePlayed };
}

// src/resolve-door.js
var HLS_MIME2 = "application/vnd.apple.mpegurl";
var RESOLVER_ALIAS = "resolver";
var RESOLVER_REPO = "xuper-plugin/kino-plugin-kino-resolver";
var CAPTURE_MS2 = 2e4;
function headersOf(s) {
  const out = {};
  if (s.referer) out.Referer = s.referer;
  const h = s.headers;
  if (Array.isArray(h)) for (const x of h) {
    if (x && x.name) out[x.name] = String(x.value);
  }
  else if (h && typeof h === "object") for (const [k, v] of Object.entries(h)) {
    if (v != null) out[k] = String(v);
  }
  return out;
}
function pickBest(streams) {
  return streams.find((s) => s && s.url && (s.kind === "hls" || /\.m3u8(\?|$)/i.test(s.url))) || streams.find((s) => s && s.url) || null;
}
async function captureStreams(kino2, embedUrl, referer) {
  const b = kino2 && kino2.browser;
  if (!b || typeof b.capture !== "function") return [];
  const opts = { timeoutMs: CAPTURE_MS2, match: "\\.m3u8|\\.mp4" };
  if (referer) opts.headers = { Referer: referer };
  let cap;
  try {
    cap = await b.capture(embedUrl, opts);
  } catch (_) {
    return [];
  }
  const out = [];
  for (const m of cap && cap.media || []) {
    if (!m || !m.url) continue;
    out.push({ url: m.url, kind: /\.m3u8(\?|$)/i.test(m.url) ? "hls" : "mp4", server: "browser", headers: m.headers || {} });
  }
  return out;
}
async function resolveViaHelper(embedUrl, kino2, referer, allowCapture = true) {
  let res = null;
  try {
    res = await kino2.plugins.call(RESOLVER_ALIAS, "resolve", { url: embedUrl, referer });
  } catch (err) {
    try {
      kino2.log("[seriesflix]", "resolver", err && err.code || "call_failed");
    } catch (_) {
    }
  }
  let streams = res && Array.isArray(res.streams) ? res.streams.slice() : [];
  const subtitles = res && Array.isArray(res.subtitles) ? res.subtitles.filter((x) => x && x.lang && x.url) : [];
  let captured = false;
  if (!streams.length && (typeof allowCapture === "function" ? allowCapture() : allowCapture)) {
    streams = await captureStreams(kino2, embedUrl, referer);
    captured = streams.length > 0;
  }
  const s = pickBest(streams);
  if (!s) return null;
  const headers = headersOf(s);
  const isHls = s.kind === "hls" || /\.m3u8(\?|$)/i.test(s.url);
  return {
    url: s.url,
    mime: isHls ? HLS_MIME2 : /\.mp4(\?|$)/i.test(s.url) ? "video/mp4" : void 0,
    ...Object.keys(headers).length ? { headers } : {},
    ...captured ? { captured: true } : {},
    ...subtitles.length ? { subtitles } : {}
  };
}
async function resolverInstalled(kino2) {
  try {
    await kino2.plugins.call(RESOLVER_ALIAS, "normalizeHost", { url: "https://probe.invalid/" });
    return true;
  } catch (err) {
    return (err && err.code) !== "provider_missing";
  }
}

// src/plugin.js
globalThis.__kinoDropPendingFetches = true;
if (typeof kino.meta !== "function") throw kino.error("unavailable", "kino.meta not available");
if (typeof kino.tmdb !== "function") throw kino.error("unavailable", "kino.tmdb not available");
var TMDB_IMG = "https://image.tmdb.org/t/p/";
var DAY_MS = 24 * 60 * 60 * 1e3;
var RESOLVE_MS = 4e4;
var MAX_COPIES = 8;
var MAX_CAPTURES = 1;
var CAPTURE_PAGE_MS = 23e3;
function takeCapture(budget) {
  if (!budget || budget.captures <= 0 || budget.deadline - Date.now() < CAPTURE_PAGE_MS) return false;
  budget.captures -= 1;
  return true;
}
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
    sub: "Subtitulado",
    needResolver: "Para reproducir, abre Seriesflix desde el men\xFA e instala el motor de reproducci\xF3n que te pedir\xE1."
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
    needResolver: "To play, open Seriesflix from the menu and install the playback engine it asks for."
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
var HOME_BUDGET_MS = 14e3;
async function home() {
  const out = HOME_ROWS.map(() => null);
  let done = false;
  const all = Promise.all(HOME_ROWS.map((row, i) => homeRow(row).then((r) => {
    out[i] = r;
  }, () => {
  }))).then(() => {
    done = true;
  });
  const end = Date.now() + HOME_BUDGET_MS;
  while (!done && Date.now() < end) await Promise.race([all, kino.sleep(Math.min(250, Math.max(1, end - Date.now())))]);
  const rows2 = out.filter(Boolean);
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
var STATS_KEY = "srvStats";
var STATS_CAP = 24;
function readStats() {
  try {
    const o = JSON.parse(kino.storage.get(STATS_KEY) || "{}");
    return o && typeof o === "object" ? o : {};
  } catch (_) {
    return {};
  }
}
function scoreOf(id, stats) {
  const s = stats[id] || { ok: 0, fail: 0 };
  return (s.ok + 1) / (s.ok + s.fail + 2);
}
function noteServer(id, ok) {
  try {
    const stats = readStats();
    const s = stats[id] || { ok: 0, fail: 0 };
    s[ok ? "ok" : "fail"] += 1;
    if (s.ok + s.fail > STATS_CAP) {
      s.ok = Math.round(s.ok / 2);
      s.fail = Math.round(s.fail / 2);
    }
    stats[id] = s;
    kino.storage.set(STATS_KEY, JSON.stringify(stats));
  } catch (_) {
  }
}
function languageOrder() {
  const pref = String(kino.config.get("language") || "lat");
  return pref === "esp" ? ["esp", "lat", "sub"] : pref === "sub" ? ["sub", "lat", "esp"] : ["lat", "esp", "sub"];
}
function ordered(copies) {
  const langs = languageOrder();
  const stats = readStats();
  const rank = (c) => langs.indexOf(c.lang) * 100 + (1 - scoreOf(c.server, stats)) * 20 + Math.max(0, SERVER_ORDER.indexOf(c.server));
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
async function open(c, req, budget) {
  try {
    const out = await resolveViaHelper(c.embedUrl, kino, SITE + "/", () => takeCapture(budget));
    return out && typeof out.url === "string" && out.url ? toStream(out, c) : null;
  } catch (e) {
    kino.log("[seriesflix]", c.server, e && e.code || "resolve_failed");
    return null;
  }
}
async function resolve(ref) {
  if (!await resolverInstalled(kino)) throw kino.error("unavailable", "resolver missing", { userMessage: t("needResolver") });
  const req = makeReq(kino, { deadline: Date.now() + RESOLVE_MS });
  const budget = { captures: MAX_CAPTURES, deadline: Date.now() + RESOLVE_MS };
  if (ref.startsWith("cp:")) {
    const want = parseCopyRef(ref);
    if (!want) throw kino.error("not_found", "bad copy ref");
    const copy = (await listCopies(await showOf(want.ep), { req })).find((c) => c.lang === want.lang && c.server === want.server);
    const stream = copy ? await open(copy, req, budget) : null;
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
    main = await open(c, req, budget);
    noteServer(c.server, !!main);
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
var SUPPORT_URL = "https://ko-fi.com/xuperplugins";
function supportNode(device) {
  if (device === "tv") return { type: "QrImage", value: SUPPORT_URL, size: "large", labelText: "Si te gusta mi trabajo, escan\xE9alo y ap\xF3yame", labelTextEn: "If you like my work, scan it and support me" };
  return { type: "ElevatedButton", key: "donate", icon: "heart", labelText: "Si te gusta mi trabajo, ap\xF3yame", labelTextEn: "If you like my work, support me", onPressed: { go: { url: { href: SUPPORT_URL } } } };
}
function installGateView(device) {
  return {
    type: "Scaffold",
    key: "seriesflix-install",
    body: { type: "SingleChildScrollView", key: "installScroll", children: [
      { type: "Column", padding: 24, gap: 16, crossAxisAlignment: "stretch", children: [
        { type: "Text", text: "Necesitas el motor de reproducci\xF3n", textEn: "You need the playback engine", style: "h3" },
        { type: "Text", color: "secondary", text: "Seriesflix reproduce a trav\xE9s de Kino Resolver (gratis). Inst\xE1lalo una vez y sirve para este y para otros plugins de sitios.", textEn: "Seriesflix plays through Kino Resolver (free). Install it once and it works here and in other site plugins." },
        { type: "ElevatedButton", key: "installResolver", labelText: "Instalar Kino Resolver", labelTextEn: "Install Kino Resolver", onPressed: { go: { installPlugin: { repo: RESOLVER_REPO } } } },
        supportNode(device)
      ] }
    ] }
  };
}
var SCREEN_TABS = [
  { id: "series", es: "Series", en: "Series" }
];
var browseInstance = null;
var browseScreen = () => browseInstance ?? (browseInstance = makeBrowse({
  kino,
  brand: "Seriesflix",
  tabs: SCREEN_TABS,
  loadTab: async () => ({ rows: await home() }),
  searchTitles: (q) => search({ q }),
  canPlay: false
}));
async function screen(ctx) {
  await null;
  const c = ctx && typeof ctx === "object" ? ctx : {};
  if (!(c.installed && c.installed[RESOLVER_REPO])) return installGateView(c.device);
  return browseScreen().view(c);
}
async function screenEvent(ev) {
  await null;
  return browseScreen().event(ev && typeof ev === "object" ? ev : {});
}
export {
  action,
  browse,
  categories,
  episodes,
  home,
  resolve,
  screen,
  screenEvent,
  search
};
