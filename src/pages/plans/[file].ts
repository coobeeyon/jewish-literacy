// Each prayer's reading plan (per nusach) as its own small, content-hashed JSON file.
import type { APIRoute } from "astro";
import { allPlans } from "../../plans";

export function getStaticPaths() {
  return allPlans().map(plan => ({ params: { file: plan.name }, props: { body: plan.body } }));
}

export const GET: APIRoute = ({ props }) => new Response(props.body as string, { headers: { "Content-Type": "application/json" } });
