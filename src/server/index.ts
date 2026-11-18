import { Client } from "@opensearch-project/opensearch";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ollamaLlm } from "../ai/llm.js";
import { titanEmbedder } from "../ai/titan.js";
import type { PipelineDeps } from "../pipeline.js";
import { createQueue } from "../queue.js";
import { INDEX, searchTemplates } from "../search/index.js";
import { statsRoutes } from "../stats.js";
import { openStore } from "../store.js";
import { createApp } from "./app.js";
import { fakeAiDeps } from "./fake-ai.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ?? path.resolve(here, "../../data");
const imagesDir = path.join(dataDir, "memes");
mkdirSync(imagesDir, { recursive: true });

const store = openStore(path.join(dataDir, "memes.db"));
const queue = createQueue(2, 20);
const fake = process.env.MEME_FAKE_AI === "1";

let ai: Pick<PipelineDeps, "embedder" | "llm" | "search" | "loadTemplateImage">;
let templateCount: () => Promise<number> = async () => 3;
if (fake) {
  ai = fakeAiDeps();
} else {
  const os = new Client({ node: process.env.OPENSEARCH_URL ?? "http://localhost:9200" });
  ai = {
    embedder: titanEmbedder(),
    llm: ollamaLlm(),
    search: (vec, text, k, exclude) => searchTemplates(os, vec, text, k, exclude),
    loadTemplateImage: async (t) => readFileSync(t.imagePath),
  };
  templateCount = async () => Number((await os.count({ index: INDEX })).body.count);
}

const deps: PipelineDeps = { ...ai, store, imagesDir, queue };
const app = createApp({
  ...deps,
  rateLimit: Number(process.env.MEME_RATE_LIMIT ?? 10),
  webDir: path.resolve(here, "../../web/dist"),
  extraRoutes: (a) => statsRoutes(a, { store, llm: ai.llm, queue, logPath: path.resolve(here, "../../BUILDLOG.md"), roadmapPath: path.resolve(here, "../../ROADMAP.md"), templateCount }),
});

// Memes are kept 90 days (spec), checked hourly.
const purge = () => {
  for (const id of store.purgeOlderThan(90)) rmSync(path.join(imagesDir, `${id}.png`), { force: true });
};
purge();
setInterval(purge, 3_600_000).unref();

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => console.log(`Meme Machine on :${port} (${fake ? "fake AI" : "Titan + OpenSearch + Ollama"})`));
