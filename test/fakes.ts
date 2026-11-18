import { createCanvas } from "@napi-rs/canvas";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { vi } from "vitest";
import type { Llm } from "../src/ai/llm.js";
import type { Embedder } from "../src/ai/titan.js";
import type { Candidate, Template } from "../src/domain.js";
import type { PipelineDeps } from "../src/pipeline.js";
import { createQueue } from "../src/queue.js";
import { openStore } from "../src/store.js";

export const drake: Template = {
  id: "181913649",
  name: "Drake Hotline Bling",
  imagePath: "unused",
  width: 400,
  height: 400,
  boxes: [
    { x: 0.52, y: 0.02, w: 0.46, h: 0.46 },
    { x: 0.52, y: 0.52, w: 0.46, h: 0.46 },
  ],
  meaning: "Rejecting one thing, preferring another.",
  keywords: ["choice"],
};

export function png(w = 400, h = 400): Buffer {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#8ac";
  ctx.fillRect(0, 0, w, h);
  return c.toBuffer("image/png");
}

export function fakeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps & { calls: { embed: number } } {
  const dir = mkdtempSync(path.join(tmpdir(), "meme-test-"));
  const calls = { embed: 0 };
  const embedder: Embedder = {
    text: vi.fn(async () => {
      calls.embed++;
      return Array(1024).fill(0.01);
    }),
    image: vi.fn(async () => Array(1024).fill(0.01)),
  };
  const llm: Llm = {
    caption: vi.fn(async () => ({ templateId: drake.id, texts: ["30-minute standup", "one Slack message"] })),
    safety: vi.fn(async () => ({ ok: true })),
    meaningCard: vi.fn(async () => ({ meaning: "", keywords: [], boxRoles: [] })),
    health: vi.fn(async () => true),
  };
  const candidates: Candidate[] = [{ template: drake, score: 3 }];
  return {
    embedder,
    llm,
    search: vi.fn(async () => candidates),
    store: openStore(path.join(dir, "memes.db")),
    imagesDir: dir,
    loadTemplateImage: vi.fn(async () => png()),
    queue: createQueue(2, 20),
    calls,
    ...overrides,
  };
}
