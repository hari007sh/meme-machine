import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Box } from "../domain.js";

const overridesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/box-overrides.json");
let overrides: Record<string, Box[]> | null = null;

/** Classic layouts: one box at the bottom, two at top/bottom, more stacked evenly. */
export function defaultBoxes(boxCount: number): Box[] {
  if (boxCount <= 1) return [{ x: 0.05, y: 0.76, w: 0.9, h: 0.22 }];
  if (boxCount === 2) {
    return [
      { x: 0.05, y: 0.02, w: 0.9, h: 0.22 },
      { x: 0.05, y: 0.76, w: 0.9, h: 0.22 },
    ];
  }
  const slot = 0.96 / boxCount;
  return Array.from({ length: boxCount }, (_, i) => ({
    x: 0.05,
    y: Number((0.02 + i * slot).toFixed(4)),
    w: 0.9,
    h: Number((slot * 0.9).toFixed(4)),
  }));
}

/** Hand-tuned boxes for multi-panel templates, defaults for the rest. */
export function boxesFor(templateId: string, boxCount: number): Box[] {
  overrides ??= JSON.parse(readFileSync(overridesPath, "utf8")) as Record<string, Box[]>;
  const o = overrides[templateId];
  return o && o.length === boxCount ? o : defaultBoxes(boxCount);
}
