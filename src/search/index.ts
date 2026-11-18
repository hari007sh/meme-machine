import type { Client } from "@opensearch-project/opensearch";
import type { Candidate, Template } from "../domain.js";
import { EMBED_DIM } from "../ai/titan.js";

export const INDEX = "meme-templates";

const vectorField = {
  type: "knn_vector",
  dimension: EMBED_DIM,
  method: { name: "hnsw", engine: "lucene", space_type: "cosinesimil", parameters: { m: 16, ef_construction: 128 } },
};

export function indexMapping(): object {
  return {
    settings: { index: { knn: true, number_of_shards: 1, number_of_replicas: 0 } },
    mappings: {
      properties: {
        image_vec: vectorField,
        meaning_vec: vectorField,
        name: { type: "text" },
        meaning: { type: "text" },
        keywords: { type: "text" },
        template: { type: "object", enabled: false },
      },
    },
  };
}

export async function ensureIndex(os: Client, index = INDEX): Promise<void> {
  const exists = await os.indices.exists({ index });
  if (!exists.body) await os.indices.create({ index, body: indexMapping() as never });
}

export async function upsertTemplate(os: Client, t: Template, imageVec: number[], meaningVec: number[], index = INDEX): Promise<void> {
  await os.index({
    index,
    id: t.id,
    body: { image_vec: imageVec, meaning_vec: meaningVec, name: t.name, meaning: t.meaning, keywords: t.keywords.join(" "), template: t },
  });
}

/** Meaning vector carries most weight; the image vector and keywords break ties toward visually and lexically apt templates. */
export function buildHybridQuery(queryVec: number[], text: string, k: number, exclude: string[] = []): object {
  return {
    size: k,
    _source: ["template"],
    query: {
      bool: {
        should: [
          { knn: { meaning_vec: { vector: queryVec, k, boost: 1.0 } } },
          { knn: { image_vec: { vector: queryVec, k, boost: 0.6 } } },
          { multi_match: { query: text, fields: ["name^2", "keywords^2", "meaning"], boost: 0.3 } },
        ],
        ...(exclude.length ? { must_not: [{ ids: { values: exclude } }] } : {}),
      },
    },
  };
}

export async function searchTemplates(os: Client, queryVec: number[], text: string, k = 5, exclude: string[] = [], index = INDEX): Promise<Candidate[]> {
  const res = await os.search({ index, body: buildHybridQuery(queryVec, text, k, exclude) as never });
  const hits = (res.body as { hits: { hits: { _score: number; _source: { template: Template } }[] } }).hits.hits;
  return hits.map((h) => ({ template: h._source.template, score: h._score }));
}
