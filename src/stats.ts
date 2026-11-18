import type { Express } from "express";
import { existsSync, readFileSync } from "node:fs";
import type { Llm } from "./ai/llm.js";
import type { Timings } from "./domain.js";
import type { Queue } from "./queue.js";
import type { Store } from "./store.js";

const STAGES = ["embed", "search", "generate", "render", "total"] as const;

/** Nearest-rank percentile; 0 for an empty list. */
export function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function parseBuildLog(md: string): { date: string; title: string; body: string }[] {
  const entries: { date: string; title: string; body: string }[] = [];
  const re = /^## (\d{4}-\d{2}-\d{2}):\s*(.+)$/gm;
  const marks = [...md.matchAll(re)];
  marks.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index! : md.length;
    entries.push({ date: m[1], title: m[2].trim(), body: md.slice(start, end).trim() });
  });
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export type StatsDeps = {
  store: Store;
  llm: Pick<Llm, "health">;
  queue: Queue;
  logPath: string;
  roadmapPath: string;
  templateCount?: () => Promise<number>;
};

export function statsRoutes(app: Express, deps: StatsDeps): void {
  let cache: { at: number; body: unknown } | null = null;

  app.get("/api/stats", async (_req, res) => {
    if (cache && Date.now() - cache.at < 15_000) return void res.json(cache.body);
    const all = deps.store.counts();
    const day = deps.store.counts(new Date(Date.now() - 86_400_000).toISOString());
    const timings: Timings[] = deps.store.timings(1000);
    const latency = Object.fromEntries(
      STAGES.map((s) => {
        const xs = timings.map((t) => t[s]);
        return [s, { p50: percentile(xs, 50), p95: percentile(xs, 95) }];
      }),
    );
    const recentBusy = deps.store.counts(new Date(Date.now() - 120_000).toISOString()).busy > 0;
    const [gpu, templates] = await Promise.all([deps.llm.health(), deps.templateCount?.().catch(() => 0) ?? Promise.resolve(0)]);
    const body = {
      memes: all.meme,
      searches: all.search,
      refused: all.refused,
      busy: all.busy,
      templates,
      last24h: day.meme,
      latency,
      queueDepth: deps.queue.depth(),
      gpu: !gpu ? "down" : recentBusy ? "busy" : "up",
    };
    cache = { at: Date.now(), body };
    res.json(body);
  });

  app.get("/api/log", (_req, res) => {
    const md = existsSync(deps.logPath) ? readFileSync(deps.logPath, "utf8") : "";
    const roadmap = existsSync(deps.roadmapPath) ? readFileSync(deps.roadmapPath, "utf8") : "";
    res.json({ entries: parseBuildLog(md), roadmap });
  });
}
