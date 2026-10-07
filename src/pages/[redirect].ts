// Fallback pages for the old URLs (/roadmap.html, /weekday-shacharit.html). /about.html is the About
// page itself (pages are written as <path>.html), so it needs none.
import type { APIRoute } from "astro";
import { redirectPage, redirects } from "../redirects";

export function getStaticPaths() {
  return redirects.filter(([from]) => from !== "/" && from !== "/about.html").map(([from, to]) => ({ params: { redirect: from.slice(1) }, props: { to } }));
}

export const GET: APIRoute = ({ props }) => new Response(redirectPage(props.to as string), { headers: { "Content-Type": "text/html; charset=utf-8" } });
