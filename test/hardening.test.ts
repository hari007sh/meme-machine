import { createCanvas, loadImage } from "@napi-rs/canvas";
import express from "express";
import { existsSync, readdirSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { BusyError, ollamaLlm } from "../src/ai/llm.js";
import { makeMeme, RefusedError } from "../src/pipeline.js";
import { createQueue } from "../src/queue.js";
import { sanitizeText } from "../src/render/fit.js";
import { renderMeme } from "../src/render/render.js";
import { createApp } from "../src/server/app.js";
import { statsRoutes } from "../src/stats.js";
import { openStore } from "../src/store.js";
import { drake, fakeDeps, png } from "./fakes.js";

const base = "https://memes.hookboard.net";

describe("1. takedowns are not defeated by long caching", () => {
  it("images use a short edge cache", async () => {
    const app = createApp({ ...fakeDeps(), publicBaseUrl: base });
    const { body } = await request(app).post("/api/memes").send({ situation: "cache me briefly" });
    const img = await request(app).get(`/i/${body.id}.png`);
    expect(img.headers["cache-control"]).toBe("public, max-age=3600, s-maxage=600");
  });
});

describe("2. busy is answered quickly", () => {
  it("queue rejects jobs that wait longer than maxWaitMs", async () => {
    const q = createQueue(1, 10, 50);
    const hold = q.run(() => new Promise((r) => setTimeout(r, 300)));
    await expect(q.run(async () => "late")).rejects.toBeInstanceOf(BusyError);
    await hold;
  });

  it("the whole meme request is bounded by a deadline", async () => {
    const deps = fakeDeps({ deadlineMs: 100 });
    deps.llm.caption = vi.fn(() => new Promise<never>(() => {}));
    const t0 = Date.now();
    await expect(makeMeme(deps, "the GPU is asleep")).rejects.toBeInstanceOf(BusyError);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("after a busy failure, the LLM client fails fast for a cool-down", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const llm = ollamaLlm({ fetchImpl, cooldownMs: 10_000 });
    await expect(llm.caption("x", [{ template: drake, score: 1 }])).rejects.toBeInstanceOf(BusyError);
    await expect(llm.caption("x", [{ template: drake, score: 1 }])).rejects.toBeInstanceOf(BusyError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("3. rate limits hold up", () => {
  it("treats addresses in the same IPv6 /64 as one visitor", async () => {
    const app = createApp({ ...fakeDeps(), publicBaseUrl: base, rateLimit: 1 });
    const body = { situation: "ipv6 rotation trick" };
    expect((await request(app).post("/api/memes").set("cf-connecting-ip", "2001:db8:1:2::1").send(body)).status).toBe(201);
    expect((await request(app).post("/api/memes").set("cf-connecting-ip", "2001:db8:1:2:ffff::9").send(body)).status).toBe(429);
  });

  it("enforces a global daily cap", async () => {
    const app = createApp({ ...fakeDeps(), publicBaseUrl: base, dailyCap: 2 });
    for (const ip of ["1.1.1.1", "2.2.2.2"]) expect((await request(app).post("/api/memes").set("cf-connecting-ip", ip).send({ situation: "daily cap test" })).status).toBe(201);
    const third = await request(app).post("/api/memes").set("cf-connecting-ip", "3.3.3.3").send({ situation: "daily cap test" });
    expect(third.status).toBe(429);
    expect(third.body.error).toBe("daily_cap");
  });
});

describe("4. safety: blocklist and reviewable reports", () => {
  it("blocks listed words before any model call", async () => {
    const deps = fakeDeps({ blocklist: [/\bbadword\b/i] });
    await expect(makeMeme(deps, "a joke with badword in it")).rejects.toBeInstanceOf(RefusedError);
    expect(deps.llm.safety).not.toHaveBeenCalled();
    expect(deps.calls.embed).toBe(0);
  });

  it("lets an admin restore a reported meme, and only with the token", async () => {
    const app = createApp({ ...fakeDeps(), publicBaseUrl: base, adminToken: "s3cret" });
    const { body } = await request(app).post("/api/memes").send({ situation: "restore me later" });
    await request(app).post(`/api/memes/${body.id}/report`).send({});
    expect((await request(app).get(`/m/${body.id}`)).status).toBe(410);
    expect((await request(app).post(`/api/admin/memes/${body.id}/restore`)).status).toBe(401);
    expect((await request(app).post(`/api/admin/memes/${body.id}/restore`).set("authorization", "Bearer s3cret")).status).toBe(200);
    expect((await request(app).get(`/m/${body.id}`)).status).toBe(200);
  });

  it("rate-limits reports per visitor", async () => {
    const app = createApp({ ...fakeDeps(), publicBaseUrl: base, reportLimit: 2 });
    const { body } = await request(app).post("/api/memes").send({ situation: "report spam test" });
    for (let i = 0; i < 2; i++) expect((await request(app).post(`/api/memes/${body.id}/report`).set("cf-connecting-ip", "5.5.5.5")).status).toBe(202);
    expect((await request(app).post(`/api/memes/${body.id}/report`).set("cf-connecting-ip", "5.5.5.5")).status).toBe(429);
  });
});

describe("5. scripts without a font are not drawn as tofu", () => {
  it("strips code points no bundled font covers, keeps supported scripts and emoji", () => {
    expect(sanitizeText("日本語 ok")).toBe("ok");
    expect(sanitizeText("café कल தமிழ் తెలుగు 😭")).toBe("café कल தமிழ் తెలుగు 😭");
  });

  it("renders Tamil with visible ink", async () => {
    const out = await renderMeme({ ...drake, boxes: [{ x: 0, y: 0, w: 1, h: 0.4 }, { x: 0, y: 0.6, w: 1, h: 0.4 }] }, ["தமிழ் மீம்", ""], png(400, 400));
    const c = createCanvas(400, 400);
    const ctx = c.getContext("2d");
    ctx.drawImage(await loadImage(out), 0, 0);
    const { data } = ctx.getImageData(0, 0, 400, 160);
    let white = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) white++;
    expect(white).toBeGreaterThan(300);
  });
});

describe("6. GPU status reflects recent busy responses", () => {
  it("reports busy when a busy event happened in the last 2 minutes", async () => {
    const store = openStore(path.join(mkdtempSync(path.join(tmpdir(), "gpu-")), "db"));
    store.logEvent({ kind: "busy" });
    const app = express();
    statsRoutes(app, { store, llm: { health: async () => true }, queue: createQueue(2, 20), logPath: "x", roadmapPath: "y" });
    expect((await request(app).get("/api/stats")).body.gpu).toBe("busy");
  });
});

describe("7. failed attempts don't use up the quota", () => {
  it("busy and refused responses are not counted", async () => {
    const deps = fakeDeps();
    const caption = deps.llm.caption;
    deps.llm.caption = vi.fn(async () => {
      throw new BusyError("busy");
    });
    const app = createApp({ ...deps, publicBaseUrl: base, rateLimit: 2 });
    const send = () => request(app).post("/api/memes").set("cf-connecting-ip", "7.7.7.7").send({ situation: "retry until it works" });
    for (let i = 0; i < 5; i++) expect((await send()).status).toBe(503);
    deps.llm.caption = caption;
    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(429);
  });
});
