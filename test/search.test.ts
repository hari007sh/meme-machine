import { describe, expect, it } from "vitest";
import { buildHybridQuery, indexMapping } from "../src/search/index.js";

describe("indexMapping", () => {
  it("declares both 1024-d cosine vector fields with k-NN enabled", () => {
    const m = indexMapping() as any;
    expect(m.settings.index.knn).toBe(true);
    for (const field of ["image_vec", "meaning_vec"]) {
      const f = m.mappings.properties[field];
      expect(f.type).toBe("knn_vector");
      expect(f.dimension).toBe(1024);
      expect(f.method).toMatchObject({ name: "hnsw", engine: "lucene", space_type: "cosinesimil" });
    }
    expect(m.mappings.properties.template).toEqual({ type: "object", enabled: false });
  });
});

describe("buildHybridQuery", () => {
  it("combines meaning k-NN, image k-NN and keyword match with fixed boosts", () => {
    const v = Array(1024).fill(0.1);
    const q = buildHybridQuery(v, "two choices", 5) as any;
    expect(q.size).toBe(5);
    const should = q.query.bool.should;
    expect(should).toHaveLength(3);
    expect(should[0]).toEqual({ knn: { meaning_vec: { vector: v, k: 5, boost: 1.0 } } });
    expect(should[1]).toEqual({ knn: { image_vec: { vector: v, k: 5, boost: 0.6 } } });
    expect(should[2]).toEqual({ multi_match: { query: "two choices", fields: ["name^2", "keywords^2", "meaning"], boost: 0.3 } });
  });

  it("can exclude template ids", () => {
    const q = buildHybridQuery([1], "x", 5, ["181913649"]) as any;
    expect(q.query.bool.must_not).toEqual([{ ids: { values: ["181913649"] } }]);
  });
});
