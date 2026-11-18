import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import type { Template } from "../src/domain.js";
import { fitText } from "../src/render/fit.js";
import { renderMeme } from "../src/render/render.js";

function whitePng(w: number, h: number): Buffer {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  return c.toBuffer("image/png");
}

const template: Template = {
  id: "t1",
  name: "Test",
  imagePath: "unused",
  width: 600,
  height: 600,
  boxes: [
    { x: 0.05, y: 0.02, w: 0.9, h: 0.22 },
    { x: 0.05, y: 0.76, w: 0.9, h: 0.22 },
  ],
  meaning: "",
  keywords: [],
};

describe("fitText", () => {
  const ctx = createCanvas(10, 10).getContext("2d");

  it("shrinks and wraps long text so every line fits the box", () => {
    const text = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const { lines, fontSize } = fitText(ctx, text, { w: 400, h: 120 });
    expect(fontSize).toBeGreaterThanOrEqual(14);
    expect(fontSize).toBeLessThanOrEqual(64);
    for (const line of lines) expect(ctx.measureText(line).width).toBeLessThanOrEqual(400);
  });

  it("keeps short text on one large line, uppercased", () => {
    const { lines, fontSize } = fitText(ctx, "big mood", { w: 400, h: 120 });
    expect(lines).toEqual(["BIG MOOD"]);
    expect(fontSize).toBeGreaterThan(40);
  });
});

describe("renderMeme", () => {
  it("returns a PNG the size of the template", async () => {
    const png = await renderMeme(template, ["top text", "bottom text"], whitePng(600, 600));
    const img = await loadImage(png);
    expect([img.width, img.height]).toEqual([600, 600]);
  });

  it("does not throw on emoji and Devanagari", async () => {
    await expect(renderMeme(template, ["me 😭 कल", "café"], whitePng(600, 600))).resolves.toBeInstanceOf(Buffer);
  });

  it("draws a watermark in the bottom-right corner", async () => {
    const png = await renderMeme(template, ["", ""], whitePng(600, 600));
    const img = await loadImage(png);
    const c = createCanvas(600, 600);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(450, 564, 150, 36);
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) nonWhite++;
    expect(nonWhite).toBeGreaterThan(20);
  });
});
