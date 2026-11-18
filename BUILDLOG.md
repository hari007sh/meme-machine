# Build log

Dated progress on Meme Machine. Newest entries are shown first on memes.hookboard.net/log.

## 2026-11-17: Day 1: design, plan and the core engine
Picked the idea: type a situation, get the perfect meme. Designed the stack: Amazon Titan multimodal
embeddings put text and template images in one 1024-dimension space, OpenSearch k-NN does the matching,
and a self-hosted Qwen3 14B model writes the captions. Built and tested the renderer (classic outlined text,
emoji and Hindi supported), the Titan client, hybrid OpenSearch search, the caption and safety client, the
pipeline with a bounded inference queue, share pages that unfurl as the meme image, and these stats.

## 2026-11-18: Day 2: live on memes.hookboard.net
Indexed 100 Imgflip templates: each one embedded twice with Titan (its image, and an LLM-written description
of what the format means). Semantic search works: "calm while everything is on fire" finds This Is Fine,
"ignoring my girlfriend for a new shiny thing" finds Distracted Boyfriend. First live meme took under a second:
Titan 118 ms, OpenSearch 35 ms, Qwen3 604 ms, render 60 ms. Safety: satire of public figures passes; slurs,
sexual content and a named private person are refused (5/5 expected).

## 2026-11-18: Day 2: production hardening
An independent code review, then fixes: a whole-request deadline with fast back-off when inference is at
capacity, rate limits that only count successful memes (IPv6 grouped by /64) plus a global daily cap, a word
blocklist ahead of the LLM safety check, rate-limited reports with admin restore, short edge caching so
takedowns propagate in minutes, and Tamil, Telugu and Bengali rendering.
