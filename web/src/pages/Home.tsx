import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Layout } from "../Layout";
import { MemeResult } from "../MemeResult";
import { api, ApiError, type Meme } from "../lib/api";

const EXAMPLES = [
  "when the standup could have been an email",
  "explaining my code to the rubber duck",
  "Monday 9am me vs Friday 4:59pm me",
  "when the Wi-Fi drops during the one important call",
];

export default function Home() {
  const [situation, setSituation] = useState("");
  const [meme, setMeme] = useState<Meme | null>(null);
  const [tried, setTried] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  // On phones the result sits below the fold: bring it into view once it is made.
  useEffect(() => {
    if (meme) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [meme?.id]);

  const make = async (text: string, exclude: string[] = []) => {
    setBusy(true);
    setError("");
    try {
      const m = await api.make(text, exclude);
      setMeme(m);
      setTried([...exclude, m.templateId]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (situation.trim().length >= 3) make(situation.trim());
  };

  const hero = (
    <section className="mx-auto max-w-5xl px-4 pt-8 pb-12 sm:pt-14 sm:pb-16">
      <h1 className="meme-caption max-w-3xl text-5xl leading-[0.95] sm:text-7xl">Type the situation. Get the meme.</h1>
      <form onSubmit={submit} className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto]">
        <label htmlFor="situation" className="sr-only">What's the situation?</label>
        <input
          id="situation"
          aria-label="What's the situation?"
          className="h-14 w-full rounded-2xl border-2 border-ink bg-white px-4 text-lg text-ink placeholder:text-muted focus:outline-none"
          placeholder="What's the situation?"
          maxLength={280}
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
        />
        <button className="btn-dark h-14 px-6 text-lg" disabled={busy || situation.trim().length < 3}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : null}
          {busy ? "Making it…" : "Make my meme"}
        </button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25"
            onClick={() => {
              setSituation(ex);
              make(ex);
            }}
          >
            {ex}
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <Layout hero={hero}>
      {error && (
        <p className="mb-8 rounded-2xl border-2 border-ink bg-[#ffd23f] px-4 py-3 font-semibold" role="alert">
          {error}
        </p>
      )}
      {busy && !meme && <div className="aspect-square w-full max-w-xl animate-pulse rounded-2xl bg-wash" aria-label="Making your meme" />}
      <div ref={resultRef} className="scroll-mt-4" />
      {meme ? (
        <MemeResult key={meme.id} meme={meme} onChange={setMeme} busy={busy} onTryAnother={() => make(situation.trim() || EXAMPLES[0], tried)} />
      ) : (
        !busy && (
          <section>
            <h2 className="text-2xl font-extrabold">How it picks the meme</h2>
            <ol className="mt-5 grid gap-4 sm:grid-cols-4">
              {[
                ["Understand", "Amazon Titan turns your sentence into a 1,024-number meaning vector."],
                ["Match", "OpenSearch finds templates whose image and meaning sit closest to it."],
                ["Write", "Qwen3 on a dedicated GPU picks one and writes each box."],
                ["Draw", "Text is fitted into the boxes and the meme gets its own share link."],
              ].map(([t, d], i) => (
                <li key={t} className="rounded-2xl border border-line p-4">
                  <span className="font-meme text-3xl text-red">{i + 1}</span>
                  <h3 className="mt-1 font-bold">{t}</h3>
                  <p className="mt-1 text-sm text-muted">{d}</p>
                </li>
              ))}
            </ol>
          </section>
        )
      )}
    </Layout>
  );
}
