import { writeFileSync } from "node:fs";
import path from "node:path";
import { BusyError, normaliseCaption, type Llm } from "./ai/llm.js";
import type { Embedder } from "./ai/titan.js";
import { newMemeId, type Candidate, type MemeRecord, type Template, type Timings } from "./domain.js";
import type { Queue } from "./queue.js";
import { renderMeme } from "./render/render.js";
import type { Store } from "./store.js";

export type PipelineDeps = {
  embedder: Embedder;
  search: (vec: number[], text: string, k: number, exclude: string[]) => Promise<Candidate[]>;
  llm: Llm;
  store: Store;
  imagesDir: string;
  loadTemplateImage: (t: Template) => Promise<Buffer>;
  queue: Queue;
  /** Whole-request budget (default 45 s). Past it the visitor gets "busy" instead of a gateway timeout. */
  deadlineMs?: number;
  /** Words refused outright, before any model call (data/blocklist.txt). */
  blocklist?: RegExp[];
};

function withDeadline<T>(ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new BusyError("That took too long. Inference is at capacity.")), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function checkBlocklist(deps: PipelineDeps, text: string): void {
  if (deps.blocklist?.some((re) => re.test(text))) {
    deps.store.logEvent({ kind: "refused" });
    throw new RefusedError("contains a word that isn't allowed");
  }
}

export class RefusedError extends Error {
  override name = "RefusedError";
  constructor(readonly reason: string) {
    super(`Refused: ${reason}`);
  }
}

const now = () => performance.now();

async function checkSafe(deps: PipelineDeps, text: string): Promise<void> {
  checkBlocklist(deps, text);
  const verdict = await deps.queue.run(() => deps.llm.safety(text));
  if (!verdict.ok) {
    deps.store.logEvent({ kind: "refused" });
    throw new RefusedError(verdict.reason || "This doesn't follow the content rules.");
  }
}

async function finish(deps: PipelineDeps, situation: string, template: Template, texts: string[], t: Omit<Timings, "render" | "total">, start: number): Promise<MemeRecord> {
  const r0 = now();
  const png = await renderMeme(template, texts, await deps.loadTemplateImage(template));
  const id = newMemeId();
  writeFileSync(path.join(deps.imagesDir, `${id}.png`), png);
  const render = now() - r0;
  const timings: Timings = { ...t, render: Math.round(render), total: Math.round(now() - start) };
  const record: MemeRecord = { id, situation, templateId: template.id, texts, createdAt: new Date().toISOString(), hidden: false, timings };
  deps.store.saveMeme(record, template);
  deps.store.logEvent({ kind: "meme", timings });
  return record;
}

/** safety(in) → embed → search → caption (GPU queue) → normalise → safety(out) → render → save */
export async function makeMeme(deps: PipelineDeps, situation: string, opts: { exclude?: string[] } = {}): Promise<MemeRecord> {
  const start = now();
  try {
    return await withDeadline(deps.deadlineMs ?? 45_000, generate(deps, situation, opts, start));
  } catch (err) {
    if (err instanceof BusyError) deps.store.logEvent({ kind: "busy" });
    else if (!(err instanceof RefusedError)) deps.store.logEvent({ kind: "error" });
    throw err;
  }
}

async function generate(deps: PipelineDeps, situation: string, opts: { exclude?: string[] }, start: number): Promise<MemeRecord> {
  {
    await checkSafe(deps, situation);

    const e0 = now();
    const vec = await deps.embedder.text(situation);
    const embed = now() - e0;

    const s0 = now();
    const candidates = await deps.search(vec, situation, 5, opts.exclude ?? []);
    const search = now() - s0;
    if (!candidates.length) throw new Error("No templates found. Is the corpus indexed?");

    const g0 = now();
    const captioned = normaliseCaption(await deps.queue.run(() => deps.llm.caption(situation, candidates)), candidates);
    const gen = now() - g0;

    await checkSafe(deps, captioned.texts.join("\n"));
    const template = candidates.find((c) => c.template.id === captioned.templateId)!.template;
    return await finish(deps, situation, template, captioned.texts, { embed: Math.round(embed), search: Math.round(search), generate: Math.round(gen) }, start);
  }
}

/** Same template, the user's own texts (still safety-checked). */
export async function remixMeme(deps: PipelineDeps, id: string, texts: string[]): Promise<MemeRecord> {
  const original = deps.store.getMeme(id);
  if (!original || original.hidden) throw new NotFoundError();
  const start = now();
  const n = original.template.boxes.length;
  const fitted = texts.slice(0, n).map((s) => s.trim());
  while (fitted.length < n) fitted.push("");
  try {
    return await withDeadline(
      deps.deadlineMs ?? 45_000,
      checkSafe(deps, fitted.join("\n")).then(() => finish(deps, original.situation, original.template, fitted, { embed: 0, search: 0, generate: 0 }, start)),
    );
  } catch (err) {
    if (err instanceof BusyError) deps.store.logEvent({ kind: "busy" });
    throw err;
  }
}

export class NotFoundError extends Error {
  override name = "NotFoundError";
}
