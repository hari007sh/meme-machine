import { Check, Download, Flag, Link2, Pencil, Shuffle } from "lucide-react";
import { useState } from "react";
import { api, ApiError, type Meme } from "./lib/api";

const STAGES: { key: keyof Meme["timings"]; label: string }[] = [
  { key: "embed", label: "Titan embed" },
  { key: "search", label: "OpenSearch" },
  { key: "generate", label: "Qwen3 captions" },
  { key: "render", label: "Render" },
];

export function MemeResult({
  meme,
  onChange,
  onTryAnother,
  busy,
}: {
  meme: Meme;
  onChange: (m: Meme) => void;
  onTryAnother?: () => void;
  busy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [texts, setTexts] = useState(meme.texts);
  const [shared, setShared] = useState(false);
  const [error, setError] = useState("");
  const [reported, setReported] = useState(false);
  const alt = `Meme: ${meme.texts.filter(Boolean).join(" / ")}`;
  // imageUrl/url are absolute (for sharing); load from this host so it works on any domain or in dev.
  const src = new URL(meme.imageUrl, window.location.origin).pathname;

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ url: meme.url, title: "Meme Machine" });
      else {
        await navigator.clipboard.writeText(meme.url);
        setShared(true);
        setTimeout(() => setShared(false), 1800);
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  const saveRemix = async () => {
    setError("");
    try {
      const m = await api.remix(meme.id, texts);
      setEditing(false);
      onChange(m);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't remix that.");
    }
  };

  return (
    <section className="grid items-start gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" aria-live="polite">
      <img src={src} alt={alt} className="w-full rounded-2xl border border-line bg-wash shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)]" />
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-2">
          <a className="btn-dark" href={src} download={`meme-${meme.id}.png`}>
            <Download className="size-4" /> Download
          </a>
          <button type="button" className="btn-dark" onClick={share}>
            {shared ? <Check className="size-4" /> : <Link2 className="size-4" />} {shared ? "Link copied" : "Share"}
          </button>
          <button type="button" className="btn-light" onClick={() => setEditing(!editing)} aria-expanded={editing}>
            <Pencil className="size-4" /> Remix
          </button>
          {onTryAnother && (
            <button type="button" className="btn-light" onClick={onTryAnother} disabled={busy}>
              <Shuffle className="size-4" /> Try another template
            </button>
          )}
        </div>

        {editing && (
          <form className="grid gap-2 rounded-2xl bg-wash p-4" onSubmit={(e) => (e.preventDefault(), saveRemix())}>
            {texts.map((t, i) => (
              <label key={i} className="grid gap-1 text-sm font-medium text-muted">
                Box {i + 1}
                <input
                  className="rounded-lg border-2 border-line bg-white px-3 py-2 text-base text-ink focus:border-ink focus:outline-none"
                  value={t}
                  maxLength={200}
                  onChange={(e) => setTexts(texts.map((x, j) => (j === i ? e.target.value : x)))}
                />
              </label>
            ))}
            <button className="btn-dark mt-1">Save remix</button>
            {error && <p className="text-sm text-red-deep" role="alert">{error}</p>}
          </form>
        )}

        <dl className="grid grid-cols-2 gap-2 text-sm" aria-label="How long each step took">
          {STAGES.map((s) => (
            <div key={s.key} className="rounded-xl border border-line px-3 py-2">
              <dt className="text-muted">{s.label}</dt>
              <dd className="font-semibold tabular-nums">{meme.timings[s.key]} ms</dd>
            </div>
          ))}
        </dl>

        <button
          type="button"
          className="justify-self-start text-sm text-muted underline disabled:no-underline"
          disabled={reported}
          onClick={async () => {
            await api.report(meme.id).catch(() => {});
            setReported(true);
          }}
        >
          <Flag className="mr-1 inline size-3.5" />
          {reported ? "Reported. Thanks, we'll take a look." : "Report this meme"}
        </button>
      </div>
    </section>
  );
}
