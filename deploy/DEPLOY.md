# Deploying Meme Machine

## Topology

```
Internet ─▶ Cloudflare (CDN + Tunnel, no inbound ports)
              └─▶ app container :8080 ──┬─▶ OpenSearch 2.19 (private Docker network)
                                         ├─▶ GPU inference server: Ollama + qwen3:14b (private network)
                                         └─▶ Amazon Bedrock: amazon.titan-embed-image-v1 (ca-central-1)
```

## 1. GPU inference server
Any Linux host with an NVIDIA GPU (≥16 GB VRAM recommended for qwen3:14b).
1. Install Ollama, then copy `ollama/override.conf.example` to `/etc/systemd/system/ollama.service.d/override.conf`,
   set `<private-ip>`, and run `systemctl daemon-reload && systemctl restart ollama`.
2. `ollama pull qwen3:14b`
3. From the app host: `curl http://<private-ip>:11434/api/tags` lists the model.

## 2. AWS
Create an IAM user (or role) with only `iam/titan-only-policy.json`. Put its credentials in `.env`
(never commit it). Bedrock model access for Titan Multimodal Embeddings G1 must be enabled in ca-central-1.

## 3. App host
1. OpenSearch needs `vm.max_map_count=262144` (persist it in your host's boot config).
2. `cp .env.example .env` and fill it in (`OLLAMA_URL`, AWS keys, `ADMIN_TOKEN`, `MEME_DAILY_CAP`).
3. `docker network create edge` (shared with your tunnel connector), then `cd deploy && docker compose up -d --build`.
4. Build the corpus: `docker exec meme-app node_modules/.bin/tsx scripts/ingest.ts` (→ `done: indexed 100/100`).

## 4. Edge
Run `cloudflared` on the `edge` network with an ingress rule `memes.example.com → http://meme-app:8080`,
and route DNS to the tunnel. Health check: `GET /api/stats` (`templates`, `gpu: up|busy|down`).

## Operations
- Restore a reported meme: `POST /api/admin/memes/:id/restore` with `Authorization: Bearer $ADMIN_TOKEN`.
- Memes older than 90 days are purged hourly.
