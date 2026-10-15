// Local server: the same API handler as production (against real SQLite) plus the built site with the same security
// headers as public/_headers. Used for `npm start`, for development, and as the target of the end-to-end tests.
// It is never deployed; production uses Cloudflare Pages Functions and D1.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "./app.ts";
import type { Env } from "./config.ts";
import { openDatabase, sqliteDb } from "./db/sqlite.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon",
};

/** Parse Cloudflare's `_headers` format: a path pattern line followed by indented "Name: value" lines. */
export function parseHeadersFile(text: string): { pattern: string; headers: Record<string, string> }[] {
  const blocks: { pattern: string; headers: Record<string, string> }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) blocks.push({ pattern: line.trim(), headers: {} });
    else if (line.includes(":") && blocks.length) {
      const i = line.indexOf(":");
      blocks[blocks.length - 1]!.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return blocks;
}

const matches = (pattern: string, path: string): boolean => (pattern.endsWith("/*") ? path.startsWith(pattern.slice(0, -1)) || (pattern === "/*") : pattern === path);

export interface DevServerOptions {
  port?: number;
  dbPath?: string;
  staticDir?: string;
  env?: Partial<Env>;
}

export function createDevServer(opts: DevServerOptions = {}): Server {
  const staticDir = resolve(opts.staticDir ?? join(ROOT, "dist"));
  const raw = openDatabase(opts.dbPath ?? ":memory:", join(ROOT, "migrations"));
  const db = sqliteDb(raw);
  const env: Env = { DB: undefined as never, COOKIE_INSECURE: "1", ...opts.env };
  const headerBlocks = existsSync(join(ROOT, "public", "_headers")) ? parseHeadersFile(readFileSync(join(ROOT, "public", "_headers"), "utf8")) : [];
  const headersFor = (path: string): Record<string, string> => Object.assign({}, ...headerBlocks.filter((b) => matches(b.pattern, path)).map((b) => b.headers));

  async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", req.socket.remoteAddress ?? "unknown");
    const method = req.method ?? "GET";
    const body = method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks);
    const response = await handle(new Request(url, { method, headers, body }), env, { db });
    const out: Record<string, string | string[]> = {};
    response.headers.forEach((v, k) => { if (k !== "set-cookie") out[k] = v; });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) out["set-cookie"] = cookies;
    // Like Cloudflare Pages, the _headers rules apply to static files only; API responses carry the handler's own headers.
    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
  }

  function serveStatic(res: ServerResponse, url: URL): void {
    const path = decodeURIComponent(url.pathname);
    let file = resolve(join(staticDir, normalize(path)));
    if (!file.startsWith(staticDir)) { res.writeHead(403).end("forbidden"); return; }
    let status = 200;
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (extname(path)) { res.writeHead(404, headersFor(path)).end("not found"); return; } // a missing asset is a 404
      file = join(staticDir, "index.html"); // client-side routes get the app shell, like the Pages SPA fallback
      if (!existsSync(file)) { res.writeHead(503).end("run `npm run build` first"); return; }
      status = 200;
    }
    res.writeHead(status, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", ...headersFor(path) });
    res.end(readFileSync(file));
  }

  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const run = url.pathname.startsWith("/api/") ? api(req, res, url) : Promise.resolve(serveStatic(res, url));
    run.catch((e) => {
      console.error("dev_server_error", e instanceof Error ? e.message : String(e));
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
}

// Run directly: `node server/dev-server.ts`. Configuration comes from the environment.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const e = process.env;
  const port = Number(e.PORT ?? 8788);
  const server = createDevServer({
    dbPath: e.DB_PATH ?? join(ROOT, ".data", "dev.db"),
    env: {
      ADMIN_PASSPHRASE: e.ADMIN_PASSPHRASE ?? "dev-passphrase",
      SESSION_SECRET: e.SESSION_SECRET ?? "dev-session-secret-0123456789abcdef",
      STUDIO_TIMEZONE: e.STUDIO_TIMEZONE,
      COOKIE_INSECURE: e.COOKIE_INSECURE ?? "1",
      RATE_LIMIT_BOOK: e.RATE_LIMIT_BOOK,
      RATE_LIMIT_CANCEL: e.RATE_LIMIT_CANCEL,
      RATE_LIMIT_LOGIN: e.RATE_LIMIT_LOGIN,
    },
  });
  server.listen(port, "127.0.0.1", () => console.log(`studio-slot dev server on http://127.0.0.1:${port} (db: ${e.DB_PATH ?? ".data/dev.db"})`));
}
