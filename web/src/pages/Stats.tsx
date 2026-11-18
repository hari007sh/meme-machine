import { useEffect, useState } from "react";
import { Layout } from "../Layout";
import { api, type Stats } from "../lib/api";

const STAGES = [
  ["embed", "Titan embeddings (AWS Bedrock)"],
  ["search", "OpenSearch vector search"],
  ["generate", "Qwen3 14B captions (GPU inference)"],
  ["render", "Render"],
  ["total", "End to end"],
] as const;

export default function StatsPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const load = () => api.stats().then(setS).catch(() => setFailed(true));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const max = s ? Math.max(1, ...STAGES.map(([k]) => s.latency[k].p95)) : 1;

  return (
    <Layout>
      <h1 className="text-4xl font-extrabold">Live stats</h1>
      <p className="mt-2 text-muted">Real numbers from the running system, refreshed every 15 seconds.</p>
      {failed && !s && <p className="mt-6" role="alert">Stats are unavailable right now.</p>}
      {s && (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Memes made", s.memes],
              ["Last 24 hours", s.last24h],
              ["Templates indexed", s.templates],
              ["Refused by safety check", s.refused],
            ].map(([label, n]) => (
              <div key={label} className="rounded-2xl border border-line p-4">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="font-meme text-4xl tabular-nums">{Number(n).toLocaleString()}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 flex items-center gap-2 font-semibold">
            <span className={`size-3 rounded-full ${s.gpu === "up" ? "bg-ok" : s.gpu === "busy" ? "bg-[#ffb020]" : "bg-red"}`} aria-hidden="true" />
            Inference {s.gpu === "up" ? "online" : s.gpu === "busy" ? "at capacity" : "offline"} · {s.queueDepth} waiting in the queue
          </p>

          <h2 className="mt-10 text-2xl font-extrabold">Latency per step</h2>
          <p className="mt-1 text-sm text-muted">Bars show p95; the number in bold is the median (p50).</p>
          <ul className="mt-5 grid gap-4">
            {STAGES.map(([k, label]) => (
              <li key={k}>
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="tabular-nums"><strong>{s.latency[k].p50} ms</strong> · p95 {s.latency[k].p95} ms</span>
                </div>
                <div className="mt-1.5 h-3 rounded-full bg-wash">
                  <div className={`h-3 rounded-full ${k === "total" ? "bg-ink" : "bg-red"}`} style={{ width: `${(s.latency[k].p95 / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Layout>
  );
}
