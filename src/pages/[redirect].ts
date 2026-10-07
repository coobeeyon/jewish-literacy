// Fallback pages for the old URLs (/roadmap.html, /weekday-shacharit.html, /about.html).
import type { APIRoute } from "astro";
import { redirectPage, redirects } from "../redirects";

export function getStaticPaths() {
  return redirects.filter(([from]) => from !== "/").map(([from, to]) => ({ params: { redirect: from.slice(1) }, props: { to } }));
}

export const GET: APIRoute = ({ props }) => new Response(redirectPage(props.to as string), { headers: { "Content-Type": "text/html; charset=utf-8" } });
