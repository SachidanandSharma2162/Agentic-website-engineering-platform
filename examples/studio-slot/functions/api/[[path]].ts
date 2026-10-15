// Cloudflare Pages Function: every /api/* request is handled by the same router the tests and the dev server use.
import { handle } from "../../server/app.ts";
import type { Env } from "../../server/config.ts";

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => handle(context.request, context.env);
