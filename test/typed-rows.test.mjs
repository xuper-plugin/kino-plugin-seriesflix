// The Home's rows carry the type tag Kino shelves titles by, and the Anime row is what is airing now, not the all-time favourites.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createKino } from "../sdk/kino-shim.mjs";

test("the Home rows are tagged series, infantil, anime and documentales", async () => {
  const manifest = JSON.parse(readFileSync(new URL("../kino-plugin.json", import.meta.url), "utf8"));
  globalThis.kino = createKino(manifest, { lang: "es-CO", device: "phone" }).kino;
  const plugin = await import("../src/plugin.js?typed=" + Date.now());
  const tags = plugin.homeRowTags();
  assert.equal(tags.trending, "series");
  assert.equal(tags.kids, "infantil");
  assert.equal(tags.anime, "anime");
  assert.deepEqual(Object.keys(tags), plugin.HOME_ROWS.map((r) => r.id));
  const p = plugin.airingAnime(new Date("2026-11-24T12:00:00Z"));
  assert.equal(p["air_date.gte"], "2026-09-25");
  assert.equal(p["air_date.lte"], "2026-11-24");
  assert.equal(p.with_origin_country, "JP");
});
