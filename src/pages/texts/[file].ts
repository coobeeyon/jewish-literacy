// Each prayer's text (per nusach) as its own small, content-hashed JSON file (see src/texts.ts).
import type { APIRoute } from "astro";
import { allTextFiles } from "../../texts";

export function getStaticPaths() {
  return allTextFiles().map(file => ({ params: { file: file.name }, props: { body: file.body } }));
}

export const GET: APIRoute = ({ props }) => new Response(props.body as string, { headers: { "Content-Type": "application/json" } });
