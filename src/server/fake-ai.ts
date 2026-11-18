import { createCanvas } from "@napi-rs/canvas";
import type { Candidate, Template } from "../domain.js";
import type { PipelineDeps } from "../pipeline.js";

/** Deterministic stand-ins for Titan, OpenSearch and Ollama (MEME_FAKE_AI=1): UI work and e2e tests without the GPU or AWS. */
export function fakeAiDeps(): Pick<PipelineDeps, "embedder" | "llm" | "search" | "loadTemplateImage"> {
  const colours: Record<string, string> = { "fake-choice": "#3f7cff", "fake-fire": "#ff6a3d", "fake-brain": "#18a36f" };
  const templates: Template[] = [
    { id: "fake-choice", name: "Two Choices", imagePath: "", width: 600, height: 600, boxes: [{ x: 0.05, y: 0.02, w: 0.9, h: 0.22 }, { x: 0.05, y: 0.76, w: 0.9, h: 0.22 }], meaning: "Picking between two things.", keywords: ["choice"] },
    { id: "fake-fire", name: "This Is Fine", imagePath: "", width: 600, height: 450, boxes: [{ x: 0.05, y: 0.02, w: 0.9, h: 0.22 }, { x: 0.05, y: 0.76, w: 0.9, h: 0.22 }], meaning: "Calm in chaos.", keywords: ["chaos"] },
    { id: "fake-brain", name: "Galaxy Brain", imagePath: "", width: 600, height: 600, boxes: [{ x: 0.05, y: 0.02, w: 0.9, h: 0.22 }, { x: 0.05, y: 0.76, w: 0.9, h: 0.22 }], meaning: "Escalating ideas.", keywords: ["smart"] },
  ];
  return {
    embedder: { text: async () => Array(1024).fill(0.01), image: async () => Array(1024).fill(0.01) },
    search: async (_v, _t, k, exclude): Promise<Candidate[]> =>
      templates.filter((t) => !exclude.includes(t.id)).slice(0, k).map((template, i) => ({ template, score: 3 - i })),
    llm: {
      caption: async (situation, candidates) => {
        const words = situation.split(/\s+/);
        const mid = Math.ceil(words.length / 2);
        return { templateId: candidates[0].template.id, texts: [words.slice(0, mid).join(" "), words.slice(mid).join(" ") || "every time"] };
      },
      safety: async (text) => (/\bslur\b/i.test(text) ? { ok: false, reason: "contains a slur" } : { ok: true }),
      meaningCard: async () => ({ meaning: "", keywords: [], boxRoles: [] }),
      health: async () => true,
    },
    loadTemplateImage: async (t) => {
      const c = createCanvas(t.width, t.height);
      const ctx = c.getContext("2d");
      ctx.fillStyle = colours[t.id] ?? "#888";
      ctx.fillRect(0, 0, t.width, t.height);
      return c.toBuffer("image/png");
    },
  };
}
