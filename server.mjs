import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

// Serves the prebuilt site in dist/: each view is its own page (/weekday/shacharit is
// dist/weekday/shacharit/index.html), old URLs redirect, and anything else gets dist/404.html.
const root = new URL("./dist/", import.meta.url).pathname;
const host = process.env.JL_HOST || "127.0.0.1";
const port = Number(process.env.JL_PORT || 4173);
// Keep in step with src/redirects.ts and netlify.toml.
const redirects = new Map([
  ["/roadmap.html", [301, "/weekday/shacharit"]],
  ["/weekday-shacharit.html", [301, "/weekday/shacharit"]],
  ["/about.html", [301, "/about"]],
  ["/", [302, "/weekday/shacharit"]],
]);
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".woff": "font/woff", ".woff2": "font/woff2", ".json": "application/json", ".svg": "image/svg+xml" };
// scripts/compress-dist.mjs writes these beside each text asset at build time.
const compressible = new Set([".js", ".css", ".html", ".json", ".svg"]);
const encodings = [["br", ".br"], ["gzip", ".gz"]];

/** The encodings the client accepts (q > 0), from its Accept-Encoding header. */
function accepted(header = "") {
  const out = new Set();
  for (const part of header.split(",")) {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    const q = params.map(p => p.trim()).find(p => p.startsWith("q="));
    if (name && !(q && Number(q.slice(2)) === 0)) out.add(name);
  }
  return out;
}

const isFile = file => existsSync(file) && statSync(file).isFile();

/** The file a path names: the file itself, or a view's page; otherwise the not-found page. */
function resolve(pathname) {
  const notFound = { file: join(root, "404.html"), status: 404 };
  let relative;
  try { relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, ""); } catch { return notFound; }
  for (const file of [join(root, relative), join(root, relative, "index.html")]) if (file.startsWith(root) && isFile(file)) return { file, status: 200 };
  return notFound;
}

createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const redirect = redirects.get(url.pathname);
  if (redirect) { response.writeHead(redirect[0], { Location: redirect[1] }); response.end(); return; }
  const { file, status } = resolve(url.pathname);
  const type = extname(file);
  // Pages are revalidated every time; everything else has a content hash in its name.
  const headers = { "Content-Type": mime[type] || "application/octet-stream", "Cache-Control": type === ".html" ? "no-cache" : "public, max-age=31536000, immutable" };
  let body = file;
  if (compressible.has(type)) {
    headers.Vary = "Accept-Encoding";
    const accepts = accepted(request.headers["accept-encoding"]);
    const match = encodings.find(([name, suffix]) => accepts.has(name) && existsSync(file + suffix));
    if (match) { headers["Content-Encoding"] = match[0]; body = file + match[1]; }
  }
  headers["Content-Length"] = statSync(body).size;
  response.writeHead(status, headers);
  if (request.method === "HEAD") { response.end(); return; }
  createReadStream(body).pipe(response);
}).listen(port, host, () => console.log(`Jewish Literacy preview listening on http://${host}:${port}`));
