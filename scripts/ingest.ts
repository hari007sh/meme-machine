/**
 * Builds the template corpus: Imgflip's top templates → image on disk → LLM meaning card →
 * Titan image + meaning embeddings → OpenSearch. Safe to re-run: images and meaning cards are cached.
 *
 *   npm run ingest            (inside the app container on the server)
 */
import { Client } from "@opensearch-project/opensearch";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ollamaLlm, type MeaningCard } from "../src/ai/llm.js";
import { titanEmbedder } from "../src/ai/titan.js";
import { boxesFor } from "../src/corpus/boxes.js";
import type { Template } from "../src/domain.js";
import { ensureIndex, upsertTemplate } from "../src/search/index.js";

const IMGFLIP = "https://api.imgflip.com/get_memes";
const dataDir = process.env.DATA_DIR ?? "./data";
const templatesDir = path.join(dataDir, "templates");
const cachePath = path.join(dataDir, "meaning-cache.json");

type ImgflipMeme = { id: string; name: string; url: string; width: number; height: number; box_count: number };

async function main() {
  mkdirSync(templatesDir, { recursive: true });
  const os = new Client({ node: process.env.OPENSEARCH_URL ?? "http://localhost:9200" });
  const embedder = titanEmbedder();
  const llm = ollamaLlm({ timeoutMs: 120_000 });
  const cache: Record<string, MeaningCard> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};

  await ensureIndex(os);
  const res = await fetch(IMGFLIP);
  const memes: ImgflipMeme[] = (await res.json()).data.memes;
  let ok = 0;

  for (const m of memes) {
    try {
      const ext = path.extname(new URL(m.url).pathname) || ".jpg";
      const imagePath = path.join(templatesDir, `${m.id}${ext}`);
      if (!existsSync(imagePath)) {
        const img = await fetch(m.url);
        if (!img.ok) throw new Error(`image ${img.status}`);
        writeFileSync(imagePath, Buffer.from(await img.arrayBuffer()));
      }

      cache[m.id] ??= await llm.meaningCard(m.name, m.box_count);
      writeFileSync(cachePath, JSON.stringify(cache, null, 2));
      const card = cache[m.id];
      const roles = card.boxRoles.slice(0, m.box_count).map((r, i) => `${i + 1}) ${r}`).join(" ");

      const template: Template = {
        id: m.id,
        name: m.name,
        imagePath,
        width: m.width,
        height: m.height,
        boxes: boxesFor(m.id, m.box_count),
        meaning: `${card.meaning} Boxes: ${roles}`,
        keywords: card.keywords,
      };
      const [imageVec, meaningVec] = await Promise.all([
        embedder.image(readFileSync(imagePath)),
        embedder.text(`${m.name}. ${card.meaning} ${card.keywords.join(", ")}`),
      ]);
      await upsertTemplate(os, template, imageVec, meaningVec);
      ok++;
      console.log(`indexed ${ok}/${memes.length}  ${m.name}`);
    } catch (err) {
      console.error(`skipped ${m.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  await os.indices.refresh({ index: "meme-templates" });
  console.log(`done: indexed ${ok}/${memes.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
