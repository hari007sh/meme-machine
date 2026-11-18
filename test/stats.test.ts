import express from "express";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createQueue } from "../src/queue.js";
import { parseBuildLog, percentile, statsRoutes } from "../src/stats.js";
import { openStore } from "../src/store.js";

describe("percentile (nearest-rank)", () => {
  it("computes p50 and p95", () => {
    const xs = [100, 200, 300, 400, 1000];
    expect(percentile(xs, 50)).toBe(300);
    expect(percentile(xs, 95)).toBe(1000);
    expect(percentile([], 50)).toBe(0);
  });
});

describe("parseBuildLog", () => {
  it("returns dated entries newest first", () => {
    const md = "# Build log\n\n## 2026-11-17: Day 1\nDesign.\n\n## 2026-11-18: Day 2\nShipped search.\n";
    const entries = parseBuildLog(md);
    expect(entries.map((e) => e.date)).toEqual(["2026-11-18", "2026-11-17"]);
    expect(entries[0]).toEqual({ date: "2026-11-18", title: "Day 2", body: "Shipped search." });
  });
});

describe("GET /api/stats and /api/log", () => {
  function setup(healthy: boolean) {
    const dir = mkdtempSync(path.join(tmpdir(), "stats-"));
    const store = openStore(path.join(dir, "db"));
    for (const total of [100, 200, 300, 400, 1000]) store.logEvent({ kind: "meme", timings: { embed: 1, search: 2, generate: 3, render: 4, total } });
    store.logEvent({ kind: "refused" });
    writeFileSync(path.join(dir, "BUILDLOG.md"), "## 2026-11-17: Day 1\nHello.\n");
    writeFileSync(path.join(dir, "ROADMAP.md"), "- Next: more templates\n");
    const app = express();
    const llm = { health: vi.fn(async () => healthy) } as any;
    statsRoutes(app, { store, llm, queue: createQueue(2, 20), logPath: path.join(dir, "BUILDLOG.md"), roadmapPath: path.join(dir, "ROADMAP.md"), templateCount: async () => 98 });
    return app;
  }

  it("reports counts, latency percentiles, queue depth and GPU state", async () => {
    const res = await request(setup(false)).get("/api/stats");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ refused: 1, templates: 98, queueDepth: 0, gpu: "down" });
    expect(res.body.latency.total).toEqual({ p50: 300, p95: 1000 });
    expect(Object.keys(res.body.latency).sort()).toEqual(["embed", "generate", "render", "search", "total"]);
  });

  it("serves the build log and roadmap", async () => {
    const res = await request(setup(true)).get("/api/log");
    expect(res.body.entries).toEqual([{ date: "2026-11-17", title: "Day 1", body: "Hello." }]);
    expect(res.body.roadmap).toContain("more templates");
  });
});
