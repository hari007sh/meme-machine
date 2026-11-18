import type { Candidate, Captioned } from "../domain.js";
import { CAPTION_SYSTEM, captionPrompt, MEANING_SYSTEM, meaningPrompt, SAFETY_SYSTEM } from "./prompts.js";

export type MeaningCard = { meaning: string; keywords: string[]; boxRoles: string[] };

export type Llm = {
  caption(situation: string, candidates: Candidate[]): Promise<Captioned>;
  safety(text: string): Promise<{ ok: boolean; reason?: string }>;
  meaningCard(name: string, boxCount: number): Promise<MeaningCard>;
  health(): Promise<boolean>;
};

/** The GPU is busy (other GPU workloads), out of memory, or the PC is unreachable. Callers answer 503 + Retry-After. */
export class BusyError extends Error {
  override name = "BusyError";
}

export function normaliseCaption(raw: Captioned, candidates: Candidate[]): Captioned {
  const chosen = candidates.find((c) => c.template.id === raw.templateId) ?? candidates[0];
  const n = chosen.template.boxes.length;
  const texts = (Array.isArray(raw.texts) ? raw.texts : []).slice(0, n).map((t) => String(t ?? "").trim());
  while (texts.length < n) texts.push("");
  return { templateId: chosen.template.id, texts };
}

export function ollamaLlm(
  opts: { url?: string; model?: string; fetchImpl?: typeof fetch; timeoutMs?: number; cooldownMs?: number } = {},
): Llm {
  const url = (opts.url ?? process.env.OLLAMA_URL ?? "http://<private-ip>:11434").replace(/\/$/, "");
  const model = opts.model ?? process.env.MEME_LLM_MODEL ?? "qwen3:14b";
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const cooldownMs = opts.cooldownMs ?? 30_000;
  // After the GPU says busy (or is unreachable), fail fast for a while instead of making every visitor wait out a timeout.
  let busyUntil = 0;
  const tripped = (msg: string) => {
    busyUntil = Date.now() + cooldownMs;
    return new BusyError(msg);
  };

  async function chat<T>(system: string, user: string, format: object, temperature: number): Promise<T> {
    if (Date.now() < busyUntil) throw new BusyError("The meme GPU is busy. Try again in a minute.");
    let res: Response;
    try {
      res = await fetchImpl(`${url}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format,
          options: { temperature },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
    } catch {
      throw tripped("The meme GPU is busy or offline.");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status >= 500 || /out of memory|cuda|busy/i.test(text)) throw tripped("The meme GPU is busy.");
      throw new Error(`Ollama returned ${res.status}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    try {
      return JSON.parse(data.message?.content ?? "") as T;
    } catch {
      throw new Error("The model returned invalid JSON.");
    }
  }

  return {
    async caption(situation, candidates) {
      const format = {
        type: "object",
        properties: {
          templateId: { type: "string", enum: candidates.map((c) => c.template.id) },
          texts: { type: "array", items: { type: "string" } },
        },
        required: ["templateId", "texts"],
      };
      return chat<Captioned>(CAPTION_SYSTEM, captionPrompt(situation, candidates), format, 0.9);
    },

    async safety(text) {
      const format = { type: "object", properties: { ok: { type: "boolean" }, reason: { type: "string" } }, required: ["ok", "reason"] };
      const out = await chat<{ ok: boolean; reason?: string }>(SAFETY_SYSTEM, `<text>\n${text}\n</text>`, format, 0);
      return { ok: out.ok === true, reason: out.reason };
    },

    async meaningCard(name, boxCount) {
      const format = {
        type: "object",
        properties: {
          meaning: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          boxRoles: { type: "array", items: { type: "string" } },
        },
        required: ["meaning", "keywords", "boxRoles"],
      };
      return chat<MeaningCard>(MEANING_SYSTEM, meaningPrompt(name, boxCount), format, 0.3);
    },

    async health() {
      try {
        const res = await fetchImpl(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
