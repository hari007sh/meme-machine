import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { boxesFor, defaultBoxes } from "../src/corpus/boxes.js";

const memes: { id: string; box_count: number }[] = JSON.parse(readFileSync("test/fixtures/get_memes.json", "utf8")).data.memes;
const overrides: Record<string, unknown[]> = JSON.parse(readFileSync("data/box-overrides.json", "utf8"));

describe("defaultBoxes", () => {
  it("puts two boxes at the classic top and bottom", () => {
    expect(defaultBoxes(2)).toEqual([
      { x: 0.05, y: 0.02, w: 0.9, h: 0.22 },
      { x: 0.05, y: 0.76, w: 0.9, h: 0.22 },
    ]);
  });

  it("stacks four boxes top to bottom without overlap", () => {
    const b = defaultBoxes(4);
    expect(b).toHaveLength(4);
    for (let i = 1; i < b.length; i++) expect(b[i].y).toBeGreaterThanOrEqual(b[i - 1].y + b[i - 1].h);
    for (const box of b) expect(box.y + box.h).toBeLessThanOrEqual(1);
  });
});

describe("box overrides", () => {
  it("match Imgflip's box_count for every overridden template", () => {
    for (const [id, boxes] of Object.entries(overrides)) {
      const meme = memes.find((m) => m.id === id);
      expect(meme, `override for unknown id ${id}`).toBeDefined();
      expect(boxes, `box count for ${id}`).toHaveLength(meme!.box_count);
    }
  });

  it("boxesFor prefers an override and falls back to defaults", () => {
    expect(boxesFor("181913649", 2)).toEqual(overrides["181913649"]);
    expect(boxesFor("does-not-exist", 2)).toEqual(defaultBoxes(2));
  });
});
