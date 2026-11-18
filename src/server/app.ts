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
  /** Memes per client IP per hour. */
  rateLimit?: number;
  /** Built web UI (web/dist). */
  webDir?: string;
  extraRoutes?: (app: express.Express) => void;
};

const CreateBody = z.object({ situation: SituationSchema, exclude: z.array(z.string().max(40)).max(20).optional() });
const RemixBody = z.object({ texts: z.array(z.string().max(200)).min(1).max(6) });
const ID = /^[A-Za-z0-9_-]{10}$/;
const IMMUTABLE = "public, max-age=31536000, immutable";

export function createApp(opts: AppOptions) {
  const base = (opts.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "https://memes.hookboard.net").replace(/\/$/, "");
  const limit = opts.rateLimit ?? 10;
  const hits = new Map<string, { count: number; resetAt: number }>();
  const indexHtmlPath = opts.webDir ? path.join(opts.webDir, "index.html") : undefined;
  const indexHtml = () => (indexHtmlPath && existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath, "utf8") : undefined);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "16kb" }));

  const clientIp = (req: Request) => req.header("cf-connecting-ip") ?? req.ip ?? "unknown";
  const rateLimited = (req: Request, res: Response, next: NextFunction) => {
    const key = clientIp(req);
    const now = Date.now();
    const e = hits.get(key);
    if (!e || e.resetAt < now) hits.set(key, { count: 1, resetAt: now + 3_600_000 });
    else if (++e.count > limit) {
      res.set("Retry-After", String(Math.ceil((e.resetAt - now) / 1000)));
      return void res.status(429).json({ error: "rate_limited", message: `You've made ${limit} memes this hour. Come back soon.` });
    }
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

  app.post("/api/memes", rateLimited, async (req, res, next) => {
    try {
      const body = CreateBody.parse(req.body);
      res.status(201).json(toJson(await makeMeme(opts, body.situation, { exclude: body.exclude })));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/memes/:id/remix", rateLimited, async (req, res, next) => {
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

  app.post("/api/memes/:id/report", (req, res) => {
    const ok = ID.test(req.params.id) && opts.store.hideMeme(req.params.id);
    res.status(ok ? 202 : 404).json({ ok });
  });

  app.get("/api/search", rateLimited, async (req, res, next) => {
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
    res.set("Cache-Control", IMMUTABLE).type("image/png").sendFile(path.resolve(opts.imagesDir, `${id}.png`));
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
