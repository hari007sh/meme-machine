import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Template } from "../domain.js";
import { FONT_STACK, fitText, LINE_HEIGHT, registerFonts, sanitizeText } from "./fit.js";

export const WATERMARK = "memes.hookboard.net";

/** Draws each text centred in its box (white fill, black outline) plus the URL watermark. */
export async function renderMeme(template: Template, texts: string[], imageBytes: Buffer): Promise<Buffer> {
  registerFonts();
  const img = await loadImage(imageBytes);
  const W = img.width;
  const H = img.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  const scale = Math.max(1, Math.min(W, H) / 500);
  template.boxes.forEach((box, i) => {
    const text = sanitizeText(texts[i] ?? "");
    if (!text.trim()) return;
    const bw = box.w * W;
    const bh = box.h * H;
    const { lines, fontSize } = fitText(ctx, text, { w: bw, h: bh }, { maxFont: Math.round(64 * scale), minFont: Math.round(14 * scale) });
    ctx.font = `${fontSize}px ${FONT_STACK}`;
    ctx.lineWidth = Math.max(2, fontSize / 8);
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#fff";
    const lineH = fontSize * LINE_HEIGHT;
    const cx = box.x * W + bw / 2;
    const top = box.y * H + bh / 2 - (lines.length * lineH) / 2 + lineH / 2;
    lines.forEach((line, n) => {
      ctx.strokeText(line, cx, top + n * lineH);
      ctx.fillText(line, cx, top + n * lineH);
    });
  });

  // Watermark: small, bottom-right, legible on light and dark images.
  const wmSize = Math.max(11, Math.round(H * 0.022));
  ctx.font = `${wmSize}px MemeLatin, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = Math.max(2, wmSize / 4);
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  const pad = Math.round(wmSize * 0.6);
  ctx.strokeText(WATERMARK, W - pad, H - pad);
  ctx.fillText(WATERMARK, W - pad, H - pad);

  return canvas.toBuffer("image/png");
}
