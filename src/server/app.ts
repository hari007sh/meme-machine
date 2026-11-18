import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z, ZodError } from "zod";
import { BusyError } from "../ai/llm.js";
import { EmbedError } from "../ai/titan.js";
import { SituationSchema } from "../domain.js";
import { makeMeme, NotFoundError, RefusedError, remixMeme, type PipelineDeps } from "../pipeline.js";
import { sharePage } from "./share.js";

export type AppOptions = PipelineDeps & {
  publicBaseUrl?: string;
  /** Successful memes per visitor per hour. */
  rateLimit?: number;
  /** Successful memes across everyone per UTC day (storage and GPU budget). */
  dailyCap?: number;
  /** Reports per visitor per hour. */
  reportLimit?: number;
  /** Searches per visitor per hour. */
  searchLimit?: number;
  /** Bearer token for /api/admin/* (unset = admin routes disabled). */
  adminToken?: string;
  /** Built web UI (web/dist). */
  webDir?: string;
  extraRoutes?: (app: express.Express) => void;
};

const CreateBody = z.object({ situation: SituationSchema, exclude: z.array(z.string().max(40)).max(20).optional() });
const RemixBody = z.object({ texts: z.array(z.string().max(200)).min(1).max(6) });
const ID = /^[A-Za-z0-9_-]{10}$/;
// Short edge cache so a reported (hidden) meme disappears from Cloudflare within minutes.
const IMAGE_CACHE = "public, max-age=3600, s-maxage=600";
const HOUR = 3_600_000;

/** One bucket per visitor; IPv6 visitors are grouped by /64 so rotating addresses inside one allocation doesn't help. */
export function visitorKey(ip: string): string {
  if (!ip.includes(":") || ip.startsWith("::ffff:")) return ip.replace(/^::ffff:/, "");
  const [head] = ip.split("::");
  const groups = head.split(":").filter(Boolean);
  const full = ip.includes("::") ? groups : ip.split(":");
  return `${full.slice(0, 4).join(":")}::/64`;
}

/** Hourly counters that only grow when the caller says so (successes), swept so the map can't grow without bound. */
function counter(limit: number) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = Date.now();
  const sweep = (now: number) => {
    if (now - lastSweep < 10 * 60_000) return;
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    lastSweep = now;
  };
  const entry = (key: string) => {
    const now = Date.now();
    sweep(now);
    let e = buckets.get(key);
    if (!e || e.resetAt < now) buckets.set(key, (e = { count: 0, resetAt: now + HOUR }));
    return e;
  };
  return {
    full: (key: string) => entry(key).count >= limit,
    add: (key: string) => void entry(key).count++,
    retryAfter: (key: string) => Math.ceil((entry(key).resetAt - Date.now()) / 1000),
  };
}

export function createApp(opts: AppOptions) {
  const base = (opts.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "https://memes.hookboard.net").replace(/\/$/, "");
  const limit = opts.rateLimit ?? 10;
  const memes = counter(limit);
  const reports = counter(opts.reportLimit ?? 20);
  const searches = counter(opts.searchLimit ?? 30);
  const dailyCap = opts.dailyCap ?? 2000;
  let day = { date: "", count: 0 };
  const today = () => {
    const d = new Date().toISOString().slice(0, 10);
    if (day.date !== d) day = { date: d, count: 0 };
    return day;
  };
  const indexHtmlPath = opts.webDir ? path.join(opts.webDir, "index.html") : undefined;
  const indexHtml = () => (indexHtmlPath && existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath, "utf8") : undefined);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "16kb" }));

  const clientIp = (req: Request) => visitorKey(req.header("cf-connecting-ip") ?? req.ip ?? "unknown");

  /** Checks the visitor's and the global budget; only a 201 response spends them. */
  const memeBudget = (req: Request, res: Response, next: NextFunction) => {
    const key = clientIp(req);
    if (today().count >= dailyCap) {
      res.set("Retry-After", "3600");
      return void res.status(429).json({ error: "daily_cap", message: "Meme Machine hit today's limit. Back tomorrow!" });
    }
    if (memes.full(key)) {
      res.set("Retry-After", String(memes.retryAfter(key)));
      return void res.status(429).json({ error: "rate_limited", message: `You've made ${limit} memes this hour. Come back soon.` });
    }
    res.on("finish", () => {
      if (res.statusCode === 201) {
        memes.add(key);
        today().count++;
      }
    });
    next();
  };

  const simpleLimit = (c: ReturnType<typeof counter>, message: string) => (req: Request, res: Response, next: NextFunction) => {
    const key = clientIp(req);
    if (c.full(key)) {
      res.set("Retry-After", String(c.retryAfter(key)));
      return void res.status(429).json({ error: "rate_limited", message });
    }
    c.add(key);
    next();
  };

  const toJson = (r: { id: string; templateId: string; texts: string[]; timings: unknown }) => ({
    id: r.id,
    url: `${base}/m/${r.id}`,
    imageUrl: `${base}/i/${r.id}.png`,
    templateId: r.templateId,
    texts: r.texts,
    timings: r.timings,
  });

  app.post("/api/memes", memeBudget, async (req, res, next) => {
    try {
      const body = CreateBody.parse(req.body);
      res.status(201).json(toJson(await makeMeme(opts, body.situation, { exclude: body.exclude })));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/memes/:id/remix", memeBudget, async (req, res, next) => {
    try {
      const { texts } = RemixBody.parse(req.body);
      res.status(201).json(toJson(await remixMeme(opts, String(req.params.id), texts)));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/memes/:id", (req, res) => {
    const m = ID.test(req.params.id) ? opts.store.getMeme(req.params.id) : null;
    if (!m || m.hidden) return void res.status(m ? 410 : 404).json({ error: m ? "removed" : "not_found" });
    res.json({ ...toJson(m), templateName: m.template.name, boxes: m.template.boxes.length, createdAt: m.createdAt });
  });

  // Reports hide immediately (safety first); an admin can restore after review.
  app.post("/api/memes/:id/report", simpleLimit(reports, "Too many reports. Try again later."), (req, res) => {
    const id = String(req.params.id);
    const ok = ID.test(id) && opts.store.hideMeme(id);
    res.status(ok ? 202 : 404).json({ ok });
  });

  app.post("/api/admin/memes/:id/restore", (req, res) => {
    const token = req.header("authorization")?.match(/^Bearer\s+(.+)$/)?.[1];
    if (!opts.adminToken || token !== opts.adminToken) return void res.status(401).json({ error: "unauthorized" });
    const id = String(req.params.id);
    const ok = ID.test(id) && opts.store.unhideMeme(id);
    res.status(ok ? 200 : 404).json({ ok });
  });

  app.get("/api/search", simpleLimit(searches, "Too many searches. Try again later."), async (req, res, next) => {
    try {
      const q = SituationSchema.parse(String(req.query.q ?? ""));
      const vec = await opts.embedder.text(q);
      const results = await opts.search(vec, q, 5, []);
      opts.store.logEvent({ kind: "search" });
      res.json({ results: results.map((c) => ({ id: c.template.id, name: c.template.name, score: Number(c.score.toFixed(4)) })) });
    } catch (err) {
      next(err);
    }
  });

  opts.extraRoutes?.(app);

  app.get("/i/:file", (req, res) => {
    const id = req.params.file.replace(/\.png$/, "");
    const m = ID.test(id) ? opts.store.getMeme(id) : null;
    if (!m) return void res.status(404).end();
    if (m.hidden) return void res.status(410).end();
    res.set("Cache-Control", IMAGE_CACHE).type("image/png").sendFile(path.resolve(opts.imagesDir, `${id}.png`), { dotfiles: "allow" });
  });

  app.get("/m/:id", (req, res) => {
    const m = ID.test(req.params.id) ? opts.store.getMeme(req.params.id) : null;
    if (!m) return void res.status(404).type("html").send("<!doctype html><p>Meme not found. <a href='/'>Make one</a></p>");
    if (m.hidden) return void res.status(410).type("html").send("<!doctype html><p>This meme was removed. <a href='/'>Make one</a></p>");
    res.set("Cache-Control", "public, max-age=300").type("html").send(sharePage(m, base, indexHtml()));
  });

  if (opts.webDir && existsSync(opts.webDir)) {
    app.use(express.static(opts.webDir, { index: false, maxAge: "1h" }));
    app.get(/^\/(?!api\/|i\/|m\/).*/, (_req, res) => res.type("html").send(indexHtml() ?? ""));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return void res.status(400).json({ error: "invalid_input", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
    }
    if (err instanceof RefusedError) return void res.status(422).json({ error: "refused", reason: err.reason });
    if (err instanceof NotFoundError) return void res.status(404).json({ error: "not_found" });
    if (err instanceof BusyError || (err instanceof EmbedError && err.retryable)) {
      res.set("Retry-After", "60");
      return void res.status(503).json({ error: "busy", message: "Busy, try again in a minute." });
    }
    console.error("request failed:", err instanceof Error ? `${err.name}: ${err.message}` : "unknown");
    res.status(500).json({ error: "internal_error", message: "Something went wrong making that meme." });
  });

  return app;
}
