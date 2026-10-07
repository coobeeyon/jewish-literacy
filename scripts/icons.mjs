// Redraw the site icon's PNG sizes from src/icons/alef.svg (run after editing it):
//   node scripts/icons.mjs
// 16 and 32 px favicons keep the rounded square; the 180 px Apple touch icon and the 192 and 512 px
// app icons are full-bleed squares, since phones round the corners themselves.
import { readFileSync } from "node:fs";
import sharp from "sharp";

const dir = new URL("../src/icons/", import.meta.url);
const svg = readFileSync(new URL("alef.svg", dir), "utf8");
const square = svg.replace(/ rx="[\d.]+"/, "");
for (const [name, size, source] of [["favicon-16.png", 16, svg], ["favicon-32.png", 32, svg], ["apple-touch-icon.png", 180, square], ["icon-192.png", 192, square], ["icon-512.png", 512, square]]) {
  await sharp(Buffer.from(source), { density: 72 * size / 64 * 4 }).resize(size, size).png({ compressionLevel: 9 }).toFile(new URL(name, dir).pathname);
  console.log(name);
}
