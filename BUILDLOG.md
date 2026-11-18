# Build log

Dated progress on Meme Machine. Newest entries are shown first on memes.hookboard.net/log.

## 2026-11-17: Day 1: design, plan and the core engine
Picked the idea: type a situation, get the perfect meme. Designed the stack: Amazon Titan multimodal
embeddings put text and template images in one 1024-dimension space, OpenSearch k-NN does the matching
on our server, and a self-hosted Qwen3 14B on our GPU writes the captions. Built and tested the renderer
(classic outlined text, emoji and Hindi supported), the Titan client, hybrid OpenSearch search, the Ollama
caption and safety client, the pipeline with a GPU queue, share pages that unfurl as the meme image, and
these stats.

## 2026-11-18: Day 2: live on memes.hookboard.net
Indexed 100 Imgflip templates: each one embedded twice with Titan (its image, and an LLM-written description
of what the format means) into OpenSearch on the server. Semantic search works: "calm while everything is on
fire" finds This Is Fine, "ignoring my girlfriend for a new shiny thing" finds Distracted Boyfriend.
First live meme took under a second: Titan 118 ms, OpenSearch 35 ms, Qwen3 14B on the GPU 604 ms,
render 60 ms. Safety checks: satire of public figures passes; slurs, sexual content and a named private
neighbour are refused (5/5 expected). Fixed share pages so links unfurl with the meme's own title.
