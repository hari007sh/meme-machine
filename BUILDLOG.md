# Build log

Dated progress on Meme Machine. Newest entries are shown first on memes.hookboard.net/log.

## 2026-11-17: Day 1: design, plan and the core engine
Picked the idea: type a situation, get the perfect meme. Designed the stack: Amazon Titan multimodal
embeddings put text and template images in one 1024-dimension space, OpenSearch k-NN does the matching
on our server, and a self-hosted Qwen3 14B on our GPU writes the captions. Built and tested the renderer
(classic outlined text, emoji and Hindi supported), the Titan client, hybrid OpenSearch search, the Ollama
caption and safety client, the pipeline with a GPU queue, share pages that unfurl as the meme image, and
these stats.
