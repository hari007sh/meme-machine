import type { StoredMeme } from "../store.js";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Open Graph + Twitter tags so a shared /m/:id link unfurls as the meme image itself. */
export function shareMeta(meme: StoredMeme, base: string): string {
  const title = esc(meme.texts.filter(Boolean).join(" / ").slice(0, 120) || "A meme");
  const image = `${base}/i/${meme.id}.png`;
  const url = `${base}/m/${meme.id}`;
  return [
    `<title>${title} · Meme Machine</title>`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Meme Machine">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="Made in seconds at memes.hookboard.net. Make your own.">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:alt" content="${esc(meme.template.name)} meme: ${title}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:image" content="${image}">`,
    `<link rel="canonical" href="${url}">`,
  ].join("\n    ");
}

/** Injects the share meta + meme JSON into the built SPA's index.html (or a minimal page if there's no build). */
export function sharePage(meme: StoredMeme, base: string, indexHtml?: string): string {
  const data = JSON.stringify({ id: meme.id, texts: meme.texts, templateName: meme.template.name, imageUrl: `${base}/i/${meme.id}.png` }).replace(
    /</g,
    "\\u003c",
  );
  const head = `${shareMeta(meme, base)}\n    <script>window.__MEME__=${data}</script>`;
  if (indexHtml) return indexHtml.replace(/<title>.*?<\/title>/s, "").replace("</head>", `    ${head}\n  </head>`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    ${head}
  </head><body><main><img src="${base}/i/${meme.id}.png" alt="meme"><p><a href="/">Make your own meme</a></p></main></body></html>`;
}
