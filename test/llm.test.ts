import { describe, expect, it, vi } from "vitest";
import type { Candidate, Template } from "../src/domain.js";
import { BusyError, normaliseCaption, ollamaLlm } from "../src/ai/llm.js";

const tpl = (id: string, boxes = 2): Template => ({
  id,
  name: `Template ${id}`,
  imagePath: "",
  width: 500,
  height: 500,
  boxes: Array.from({ length: boxes }, (_, i) => ({ x: 0, y: i / boxes, w: 1, h: 1 / boxes })),
  meaning: `meaning of ${id}`,
  keywords: [],
});
const candidates: Candidate[] = [
  { template: tpl("drake"), score: 2 },
  { template: tpl("buttons", 3), score: 1 },
];

function ollamaReply(content: unknown) {
  return vi.fn(async () => new Response(JSON.stringify({ message: { content: JSON.stringify(content) } }), { status: 200 }));
}

describe("ollamaLlm.caption", () => {
  it("asks Ollama for schema-constrained JSON restricted to the candidate ids", async () => {
    const fetchImpl = ollamaReply({ templateId: "drake", texts: ["meetings", "one email"] });
    const out = await ollamaLlm({ url: "http://gpu:11434", model: "qwen3:14b", fetchImpl }).caption("standup could be an email", candidates);
    expect(out).toEqual({ templateId: "drake", texts: ["meetings", "one email"] });
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe("http://gpu:11434/api/chat");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "qwen3:14b", stream: false, think: false, options: { temperature: 0.9 } });
    expect(body.format.properties.templateId.enum).toEqual(["drake", "buttons"]);
    expect(body.format.properties.texts.type).toBe("array");
    expect(body.messages.at(-1).content).toContain("standup could be an email");
  });

  it("throws BusyError when Ollama is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    });
    await expect(ollamaLlm({ fetchImpl }).caption("x", candidates)).rejects.toBeInstanceOf(BusyError);
  });

  it("throws BusyError when the GPU is out of memory", async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":"cudaMalloc failed: out of memory"}', { status: 500 }));
    await expect(ollamaLlm({ fetchImpl }).caption("x", candidates)).rejects.toBeInstanceOf(BusyError);
  });

  it("throws BusyError when the request exceeds the timeout", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError")))),
    );
    await expect(ollamaLlm({ fetchImpl: fetchImpl as any, timeoutMs: 50 }).caption("x", candidates)).rejects.toBeInstanceOf(BusyError);
  });
});

describe("ollamaLlm.safety and health", () => {
  it("returns the model's refusal verdict", async () => {
    const fetchImpl = ollamaReply({ ok: false, reason: "targets a private person" });
    expect(await ollamaLlm({ fetchImpl }).safety("write a slur about my neighbour")).toEqual({ ok: false, reason: "targets a private person" });
  });

  it("reports unhealthy when /api/tags fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await ollamaLlm({ fetchImpl }).health()).toBe(false);
  });
});

describe("normaliseCaption", () => {
  it("falls back to the top candidate for an unknown template id", () => {
    expect(normaliseCaption({ templateId: "nope", texts: ["a", "b"] }, candidates).templateId).toBe("drake");
  });

  it("truncates or pads texts to the template's box count", () => {
    expect(normaliseCaption({ templateId: "drake", texts: ["a", "b", "c"] }, candidates).texts).toEqual(["a", "b"]);
    expect(normaliseCaption({ templateId: "buttons", texts: ["a"] }, candidates).texts).toEqual(["a", "", ""]);
  });
});
