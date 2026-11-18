import { Client } from "@opensearch-project/opensearch";
import { describe, expect, it } from "vitest";
import type { Template } from "../src/domain.js";
import { ensureIndex, searchTemplates, upsertTemplate } from "../src/search/index.js";

// Runs only against a real OpenSearch: OPENSEARCH_URL=http://opensearch:9200 npx vitest run test/search.integration.test.ts --config /dev/null
const url = process.env.OPENSEARCH_URL;

describe.skipIf(!url)("OpenSearch hybrid search (integration)", () => {
  it("ranks the template whose meaning vector matches the query first", async () => {
    const os = new Client({ node: url! });
    const index = `it-${Date.now()}`;
    const basis = (i: number) => Array.from({ length: 1024 }, (_, j) => (j === i ? 1 : 0));
    const t = (id: string): Template => ({ id, name: `T${id}`, imagePath: "", width: 1, height: 1, boxes: [], meaning: "", keywords: [] });
    try {
      await ensureIndex(os, index);
      for (const [n, id] of ["A", "B", "C"].entries()) await upsertTemplate(os, t(id), basis(n + 10), basis(n), index);
      await os.indices.refresh({ index });
      const results = await searchTemplates(os, basis(1), "", 3, [], index);
      expect(results[0].template.id).toBe("B");
    } finally {
      await os.indices.delete({ index }).catch(() => {});
    }
  });
});
