# Meme Machine

**Type the situation. Get the meme.** → [memes.hookboard.net](https://memes.hookboard.net)

You describe a moment ("when the standup could have been an email"), and Meme Machine finds the
meme template that *means* that, writes the captions, and gives you a link that unfurls as the image.

It's a production retrieval system — **vector search + multimodal embeddings + a self-hosted LLM** — serving
real users, with live numbers at [/stats](https://memes.hookboard.net/stats) and a
dated [build log](https://memes.hookboard.net/log).

## How a meme gets made

```
"when the standup could have been an email"
        │
        ▼  1. safety check ─────────── blocklist + Qwen3 14B (self-hosted GPU inference)
        ▼  2. embed ────────────────── Amazon Titan Multimodal Embeddings G1 (Bedrock, ca-central-1) → 1024-d vector
        ▼  3. hybrid search ────────── OpenSearch 2.19 k-NN (HNSW, cosine)
        │       score = meaning-vector k-NN ×1.0 + image-vector k-NN ×0.6 + BM25 keywords ×0.3
        ▼  4. pick + caption ───────── Qwen3 picks 1 of the top 5 and writes each box (JSON schema-constrained)
        ▼  5. safety check (output)
        ▼  6. render ───────────────── @napi-rs/canvas: outlined Anton text fitted into each box + watermark
        ▼  7. share page /m/:id ────── Open Graph tags → links unfurl as the meme on X, WhatsApp, Slack, LinkedIn
```

**Why multimodal embeddings:** Titan puts text and images in the same vector space, so each template is
indexed twice: by what its picture *looks like* and by what the format *means* (a one-off description
written by the LLM). A text query can match either.

## Architecture

| Piece | Runs on | Notes |
|---|---|---|
| Web + API (Node 24, TypeScript, Express, React) | Docker | SQLite for memes/events, PNGs on a persistent volume |
| OpenSearch 2.19 | Docker | private network only, never exposed |
| LLM: Qwen3 14B via Ollama | dedicated NVIDIA GPU inference server | private network only; bounded queue + load shedding |
| Embeddings: Titan Multimodal G1 | AWS Bedrock ca-central-1 | dedicated IAM user allowed only `bedrock:InvokeModel` on that one model |
| Public edge | Cloudflare (Tunnel + CDN) | no open inbound ports; images cached at the edge |

**Under load**, inference requests queue (2 at a time, 20 waiting, 20 s max wait). Past that, or if a request
can't finish within its 45 s budget, the API sheds load with `503 busy` + `Retry-After: 60`, the model client
backs off for 30 s, and the UI says so. Per-visitor limits (IPv6 grouped by /64) count only successful memes,
and a global daily cap bounds cost.

## Safety

Satire of public figures is allowed. Refused: slurs, sexual content, threats or calls to harm, and
anything about private individuals. A blocklist runs first, then an LLM policy check on both the request and
the generated captions. Every meme has a report link; reported memes are hidden immediately (edge cache expires
within 10 minutes) and can be restored after review. Memes are link-only (no public feed) and deleted after 90 days.

## API

```
POST /api/memes            {situation, exclude?}   → 201 {id, url, imageUrl, templateId, texts, timings}
POST /api/memes/:id/remix  {texts}                 → 201 {...}
GET  /api/memes/:id
POST /api/memes/:id/report
GET  /api/search?q=...                             → top 5 templates with scores
GET  /api/stats                                    → counts, p50/p95 per stage, queue depth, GPU up/down
GET  /api/log                                      → build log + roadmap
GET  /m/:id   share page (OG tags)      GET /i/:id.png   image (immutable, cached)
```

## Develop

```bash
npm install && npm --prefix web install
npm test                         # unit tests: renderer, Titan client, search, LLM client, pipeline, API, stats
MEME_FAKE_AI=1 npm start         # whole app with deterministic fakes (no GPU/AWS), http://localhost:8080
npx playwright test              # browser tests against the fake-AI server
OPENSEARCH_URL=http://opensearch:9200 npx vitest run test/search.integration.test.ts   # real OpenSearch
```

Deployment: [`deploy/DEPLOY.md`](deploy/DEPLOY.md).

## Credits

Meme templates via the public [Imgflip API](https://imgflip.com/api); templates remain the property of their
owners. Fonts: Anton and Noto (SIL Open Font License).
