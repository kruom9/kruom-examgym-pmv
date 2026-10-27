// Local stand-in for Supabase's API gateway (Kong): one origin on :54321
//   /auth/v1/*  -> Supabase Auth (GoTrue) on :9999
//   /rest/v1/*  -> PostgREST on :54331
// plus a static file server for the apps on :8080. Localhost only.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(process.argv[2] || ".");
const KEYS = new Set((process.env.SB_API_KEYS || "").split(",").filter(Boolean));
const routes = [["/auth/v1", 9999], ["/rest/v1", 54331]];
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, prefer, range, accept-profile, content-profile, x-supabase-api-version, accept",
  "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "access-control-expose-headers": "content-range, x-supabase-api-version",
};
http.createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const r = routes.find(([p]) => req.url.startsWith(p + "/") || req.url === p);
  if (!r) { res.writeHead(404, cors); return res.end("no route"); }
  const key = req.headers["apikey"] || new URL(req.url, "http://x").searchParams.get("apikey");
  if (KEYS.size && !KEYS.has(key)) { res.writeHead(401, { ...cors, "content-type": "application/json" }); return res.end('{"message":"Invalid API key"}'); }
  const headers = { ...req.headers }; delete headers.host;
  const up = http.request({ host: "127.0.0.1", port: r[1], method: req.method, path: req.url.slice(r[0].length) || "/", headers }, (u) => {
    const h = { ...u.headers, ...cors }; res.writeHead(u.statusCode, h); u.pipe(res);
  });
  up.on("error", (e) => { res.writeHead(502, cors); res.end(String(e)); });
  req.pipe(up);
}).listen(54321, "127.0.0.1", () => console.log("gateway :54321"));

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".css": "text/css", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" }); res.end(buf);
  });
}).listen(8080, "127.0.0.1", () => console.log("static :8080 ->", ROOT));
