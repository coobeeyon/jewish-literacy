// The script that writes a deep link's calendar boxes before the first paint (src/notes-script.ts).
import type { APIRoute } from "astro";
import { notesScript } from "../../notes-script";

export function getStaticPaths() {
  return [{ params: { file: notesScript().name } }];
}

export const GET: APIRoute = () => new Response(notesScript().body, { headers: { "Content-Type": "text/javascript" } });
