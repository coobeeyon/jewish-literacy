// Post-build: write .br (Brotli quality 11) and .gz (gzip level 9) copies of every text asset in dist,
// so server.mjs can send them by Accept-Encoding. (Netlify compresses on its own.)
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const root = new URL("../dist/", import.meta.url).pathname;
const types = new Set([".js", ".css", ".html", ".json", ".svg"]);
let raw = 0, br = 0, gz = 0, files = 0;
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) { walk(file); continue; }
    if (!types.has(extname(file))) continue;
    const body = readFileSync(file);
    const brotli = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: body.length } });
    const gzip = gzipSync(body, { level: 9 });
    writeFileSync(`${file}.br`, brotli);
    writeFileSync(`${file}.gz`, gzip);
    raw += body.length; br += brotli.length; gz += gzip.length; files++;
  }
};
walk(root);
console.log(`Compressed ${files} files: ${(raw / 1024).toFixed(0)} KB raw → ${(br / 1024).toFixed(0)} KB br, ${(gz / 1024).toFixed(0)} KB gz`);
