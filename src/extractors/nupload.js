import { miss, HLS_MIME } from "./shared.js";

export const HOSTS = ["nupload.me", "nupload.my"];

export async function extract(embedUrl, req, kino) {
  const origin = new URL(embedUrl).origin;
  const r = await req(embedUrl, { headers: { Referer: origin + "/" } });
  if (!r.ok) return miss(kino, "nupload", "status " + r.status);
  const html = r.text();
  const arr = /([A-Za-z]+)\.forEach\s*\(function\s+\w+\s*\(value\)\s*\{[^}]+atob/.exec(html);
  if (!arr) return miss(kino, "nupload", "no encoded address");
  const name = arr[1];
  const off = new RegExp(name + "\\.forEach[^-]+-\\s*(\\d+)").exec(html);
  const list = new RegExp("var\\s+" + name + "\\s*=\\s*(\\[[^\\]]+\\])").exec(html);
  const sesz = /var sesz\s*=\s*"([^"]+)"/.exec(html);
  if (!off || !list || !sesz) return miss(kino, "nupload", "encoded address incomplete");
  let path = "";
  for (const v of JSON.parse(list[1])) {
    path += String.fromCharCode(parseInt(atob(v).replace(/\D/g, ""), 10) - parseInt(off[1], 10));
  }
  // The decoded address sits on a rotating host that 302s to the file. It is never fetched here (that host is not in
  // `hosts`); the player follows the redirect itself, which `streamHosts: "any"` covers.
  let url;
  try { url = new URL(path + "?s=" + sesz[1], origin).href; } catch (_) { return miss(kino, "nupload", "bad address"); }
  // The address has no extension, and the answer is an HLS playlist: say so, so the player does not have to guess.
  return /^https:\/\//i.test(url) ? { url, mime: HLS_MIME, headers: { Referer: origin + "/", Origin: origin } } : miss(kino, "nupload", "not https");
}
