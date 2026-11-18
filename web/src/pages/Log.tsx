import { useEffect, useState } from "react";
import { Layout } from "../Layout";
import { api, type LogEntry } from "../lib/api";

export default function LogPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [roadmap, setRoadmap] = useState("");

  useEffect(() => {
    api.log().then((d) => {
      setEntries(d.entries);
      setRoadmap(d.roadmap);
    }).catch(() => {});
  }, []);

  return (
    <Layout>
      <h1 className="text-4xl font-extrabold">Build log</h1>
      <p className="mt-2 text-muted">What changed and when. The code is public on GitHub.</p>
      <div className="mt-10 grid gap-10 md:grid-cols-[1fr_280px]">
        <ol className="grid gap-8">
          {entries.map((e) => (
            <li key={e.date + e.title} className="border-l-4 border-red pl-5">
              <time className="text-sm font-semibold text-muted" dateTime={e.date}>
                {new Date(`${e.date}T12:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
              </time>
              <h2 className="mt-1 text-xl font-bold">{e.title}</h2>
              <p className="mt-2 max-w-prose whitespace-pre-line text-[#2a2a2a]">{e.body}</p>
            </li>
          ))}
        </ol>
        <aside className="h-fit rounded-2xl bg-wash p-5">
          <h2 className="text-lg font-bold">Roadmap</h2>
          <ul className="mt-3 grid gap-2 text-sm">
            {roadmap.split("\n").filter((l) => l.trim().startsWith("-")).map((l) => (
              <li key={l} dangerouslySetInnerHTML={{ __html: l.replace(/^-\s*/, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>") }} />
            ))}
          </ul>
        </aside>
      </div>
    </Layout>
  );
}
