import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { BusyError } from "../src/ai/llm.js";
import { createApp } from "../src/server/app.js";
import { fakeDeps } from "./fakes.js";

const base = "https://memes.hookboard.net";

describe("POST /api/memes", () => {
  it("rejects blank and over-long situations without calling any model", async () => {
    const deps = fakeDeps();
    const app = createApp({ ...deps, publicBaseUrl: base });
    expect((await request(app).post("/api/memes").send({ situation: "   " })).status).toBe(400);
    const long = await request(app).post("/api/memes").send({ situation: "x".repeat(2000) });
    expect(long.status).toBe(400);
    expect(long.body.error).toBe("invalid_input");
    expect(deps.calls.embed).toBe(0);
  });

  it("creates a meme and returns its share and image URLs", async () => {
    const app = createApp({ ...fakeDeps(), publicBaseUrl: base });
    const res = await request(app).post("/api/memes").send({ situation: "when the standup could have been an email" });
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^https:\/\/memes\.hookboard\.net\/m\/[A-Za-z0-9_-]{10}$/);
    expect(res.body.imageUrl).toBe(`${base}/i/${res.body.id}.png`);
  });

  it("rate-limits per cf-connecting-ip", async () => {
    const app = createApp({ ...fakeDeps(), publicBaseUrl: base, rateLimit: 10 });
    const body = { situation: "monday again somehow" };
    for (let i = 0; i < 10; i++) expect((await request(app).post("/api/memes").set("cf-connecting-ip", "9.9.9.9").send(body)).status).toBe(201);
    expect((await request(app).post("/api/memes").set("cf-connecting-ip", "9.9.9.9").send(body)).status).toBe(429);
    expect((await request(app).post("/api/memes").set("cf-connecting-ip", "8.8.8.8").send(body)).status).toBe(201);
  });

  it("answers 503 with Retry-After when the GPU is busy", async () => {
    const deps = fakeDeps();
    deps.llm.caption = vi.fn(async () => {
      throw new BusyError("busy");
    });
    const res = await request(createApp({ ...deps, publicBaseUrl: base })).post("/api/memes").send({ situation: "gpu please" });
    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBe("60");
    expect(res.body.error).toBe("busy");
  });

  it("answers 422 with a reason when refused", async () => {
    const deps = fakeDeps();
    deps.llm.safety = vi.fn(async () => ({ ok: false, reason: "targets a private person" }));
    const res = await request(createApp({ ...deps, publicBaseUrl: base })).post("/api/memes").send({ situation: "my neighbour Bob is..." });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: "refused", reason: "targets a private person" });
  });
});

describe("share page, image and reports", () => {
  it("serves OG tags, an immutable PNG, and 410 after a report", async () => {
    const app = createApp({ ...fakeDeps(), publicBaseUrl: base });
    const { body } = await request(app).post("/api/memes").send({ situation: "when <the> standup \"could\" be an email" });

    const page = await request(app).get(`/m/${body.id}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain(`<meta property="og:image" content="${base}/i/${body.id}.png">`);
    expect(page.text).toContain(`<meta name="twitter:card" content="summary_large_image">`);
    expect(page.text).not.toContain("<the>");

    const img = await request(app).get(`/i/${body.id}.png`);
    expect(img.status).toBe(200);
    expect(img.headers["content-type"]).toBe("image/png");
    expect(img.headers["cache-control"]).toBe("public, max-age=31536000, immutable");

    expect((await request(app).post(`/api/memes/${body.id}/report`).send({})).status).toBe(202);
    expect((await request(app).get(`/m/${body.id}`)).status).toBe(410);
    expect((await request(app).get(`/i/${body.id}.png`)).status).toBe(410);
  });

  it("replaces the SPA's generic OG tags with the meme's own (one og:title only)", async () => {
    const deps = fakeDeps();
    const webDir = path.join(deps.imagesDir, "web");
    mkdirSync(webDir);
    writeFileSync(
      path.join(webDir, "index.html"),
      '<!doctype html><html><head><title>Meme Machine</title><meta name="description" content="generic"><meta property="og:title" content="Meme Machine"><meta property="og:description" content="generic"></head><body></body></html>',
    );
    const app = createApp({ ...deps, webDir, publicBaseUrl: base });
    const { body } = await request(app).post("/api/memes").send({ situation: "one title please" });
    const html = (await request(app).get(`/m/${body.id}`)).text;
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html).toContain('<meta property="og:title" content="30-minute standup / one Slack message">');
    expect(html.match(/property="og:description"/g)).toHaveLength(1);
  });

  it("serves images even when the data directory is inside a dot-folder", async () => {
    const deps = fakeDeps();
    const dotDir = path.join(deps.imagesDir, ".data");
    mkdirSync(dotDir);
    const app = createApp({ ...deps, imagesDir: dotDir, publicBaseUrl: base });
    const { body } = await request(app).post("/api/memes").send({ situation: "dot folders are sneaky" });
    expect((await request(app).get(`/i/${body.id}.png`)).status).toBe(200);
  });

  it("404s unknown ids and remixes known ones", async () => {
    const app = createApp({ ...fakeDeps(), publicBaseUrl: base });
    expect((await request(app).get("/m/doesnotexi")).status).toBe(404);
    const { body } = await request(app).post("/api/memes").send({ situation: "remix me please" });
    const remix = await request(app).post(`/api/memes/${body.id}/remix`).send({ texts: ["a", "b"] });
    expect(remix.status).toBe(201);
    expect(remix.body.texts).toEqual(["a", "b"]);
  });
});
