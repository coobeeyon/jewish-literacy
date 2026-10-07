import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = new URL("./dist/", import.meta.url).pathname;
const host = process.env.JL_HOST || "127.0.0.1";
const port = Number(process.env.JL_PORT || 4173);
const redirects = new Map([
  ["/roadmap.html", "/weekday/shacharit"],
  ["/weekday-shacharit.html", "/weekday/shacharit"],
  ["/about.html", "/about"],
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

createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const redirect = redirects.get(url.pathname);
  if (redirect) { response.writeHead(301, { Location: redirect }); response.end(); return; }
  const relative = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  let file = join(root, relative);
  // Anything that is not a file is an app route: the app's index.html handles it.
  if (!existsSync(file) || !statSync(file).isFile()) file = join(root, "index.html");
  const type = extname(file);
  const headers = { "Content-Type": mime[type] || "application/octet-stream", "Cache-Control": file.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable" };
  let body = file;
  if (compressible.has(type)) {
    headers.Vary = "Accept-Encoding";
    const accepts = accepted(request.headers["accept-encoding"]);
    const match = encodings.find(([name, suffix]) => accepts.has(name) && existsSync(file + suffix));
    if (match) { headers["Content-Encoding"] = match[0]; body = file + match[1]; }
  }
  headers["Content-Length"] = statSync(body).size;
  response.writeHead(200, headers);
  if (request.method === "HEAD") { response.end(); return; }
  createReadStream(body).pipe(response);
}).listen(port, host, () => console.log(`Jewish Literacy React preview listening on http://${host}:${port}`));
