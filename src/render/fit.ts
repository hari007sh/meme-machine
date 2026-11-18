import { GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fontsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");
let registered = false;

/** Anton for the classic meme look; Noto families fill in accents and Devanagari; system fonts (e.g. Noto Color Emoji in the Docker image) cover emoji. */
export const FONT_STACK = "MemeDisplay, MemeLatin, MemeDevanagari, MemeTamil, MemeTelugu, MemeBengali, sans-serif";

export function registerFonts(): void {
  if (registered) return;
  GlobalFonts.registerFromPath(path.join(fontsDir, "Anton-Regular.ttf"), "MemeDisplay");
  GlobalFonts.registerFromPath(path.join(fontsDir, "NotoSans.ttf"), "MemeLatin");
  GlobalFonts.registerFromPath(path.join(fontsDir, "NotoSansDevanagari.ttf"), "MemeDevanagari");
  GlobalFonts.registerFromPath(path.join(fontsDir, "NotoSansTamil.ttf"), "MemeTamil");
  GlobalFonts.registerFromPath(path.join(fontsDir, "NotoSansTelugu.ttf"), "MemeTelugu");
  GlobalFonts.registerFromPath(path.join(fontsDir, "NotoSansBengali.ttf"), "MemeBengali");
  registered = true;
}

export const LINE_HEIGHT = 1.1;

/** Scripts the bundled fonts (plus the emoji font in the image) can draw. Anything else would render as tofu. */
const UNSUPPORTED =
  /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}\p{Script=Devanagari}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Bengali}\p{Extended_Pictographic}\u200d\ufe0f]/gu;
const CJK_COMMON = /[\u3000-\u303f\uff00-\uffef]/g;

export function sanitizeText(text: string): string {
  return text.replace(UNSUPPORTED, "").replace(CJK_COMMON, "").replace(/\s+/g, " ").trim();
}

function wrap(ctx: SKRSContext2D, words: string[], maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fits(ctx: SKRSContext2D, lines: string[], size: number, box: { w: number; h: number }): boolean {
  if (lines.length * size * LINE_HEIGHT > box.h) return false;
  return lines.every((l) => ctx.measureText(l).width <= box.w);
}

/** Splits a single word that is wider than the box into chunks that fit. */
function breakLongWords(ctx: SKRSContext2D, words: string[], maxWidth: number): string[] {
  const out: string[] = [];
  for (const word of words) {
    if (ctx.measureText(word).width <= maxWidth) {
      out.push(word);
      continue;
    }
    let chunk = "";
    for (const ch of Array.from(word)) {
      if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
        out.push(chunk);
        chunk = ch;
      } else chunk += ch;
    }
    if (chunk) out.push(chunk);
  }
  return out;
}

/** Largest font size (14-64 by default) at which the uppercased text wraps inside the box. */
export function fitText(
  ctx: SKRSContext2D,
  text: string,
  box: { w: number; h: number },
  opts: { maxFont?: number; minFont?: number } = {},
): { lines: string[]; fontSize: number } {
  registerFonts();
  const max = opts.maxFont ?? 64;
  const min = opts.minFont ?? 14;
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], fontSize: min };

  let lo = min;
  let hi = max;
  let best: { lines: string[]; fontSize: number } | null = null;
  while (lo <= hi) {
    const size = Math.floor((lo + hi) / 2);
    ctx.font = `${size}px ${FONT_STACK}`;
    const lines = wrap(ctx, words, box.w);
    if (fits(ctx, lines, size, box)) {
      best = { lines, fontSize: size };
      lo = size + 1;
    } else hi = size - 1;
  }
  if (best) {
    ctx.font = `${best.fontSize}px ${FONT_STACK}`;
    return best;
  }
  // Even the minimum size overflows: break long words and accept extra lines.
  ctx.font = `${min}px ${FONT_STACK}`;
  return { lines: wrap(ctx, breakLongWords(ctx, words, box.w), box.w), fontSize: min };
}
