// The web app manifest: the site's name, colors and icons (src/icons) for "Add to Home Screen".
import type { APIRoute } from "astro";
import icon192 from "../icons/icon-192.png?no-inline";
import icon512 from "../icons/icon-512.png?no-inline";
import iconSvg from "../icons/alef.svg?no-inline";

export const GET: APIRoute = () => new Response(JSON.stringify({
  name: "Jewish Literacy Project",
  short_name: "Jewish Literacy",
  start_url: "/weekday/shacharit",
  display: "browser",
  theme_color: "#f7fafc",
  background_color: "#f7fafc",
  icons: [
    { src: iconSvg, type: "image/svg+xml", sizes: "any" },
    { src: icon192, type: "image/png", sizes: "192x192" },
    { src: icon512, type: "image/png", sizes: "512x512" },
  ],
}), { headers: { "Content-Type": "application/manifest+json" } });
