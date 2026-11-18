export type Timings = { embed: number; search: number; generate: number; render: number; total: number };
export type Meme = { id: string; url: string; imageUrl: string; templateId: string; texts: string[]; timings: Timings; templateName?: string };
export type Stats = {
  memes: number;
  searches: number;
  refused: number;
  busy: number;
  templates: number;
  last24h: number;
  latency: Record<keyof Timings, { p50: number; p95: number }>;
  queueDepth: number;
  gpu: "up" | "down";
};
export type LogEntry = { date: string; title: string; body: string };

export class ApiError extends Error {
  readonly kind: string;
  constructor(message: string, kind: string) {
    super(message);
    this.kind = kind;
  }
}

async function send<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 503) throw new ApiError("Busy, try again in a minute. The GPU is shared with other work.", "busy");
    if (res.status === 422) throw new ApiError(`Can't make that one: ${data.reason ?? "it breaks the content rules"}.`, "refused");
    if (res.status === 429) throw new ApiError(data.message ?? "That's a lot of memes. Try again later.", "rate_limited");
    if (res.status === 400) throw new ApiError("Describe the situation in 3 to 280 characters.", "invalid");
    throw new ApiError(data.message ?? "Something went wrong. Try again.", "error");
  }
  return data as T;
}

const post = <T>(url: string, body: unknown) =>
  send<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  make: (situation: string, exclude: string[] = []) => post<Meme>("/api/memes", { situation, exclude }),
  remix: (id: string, texts: string[]) => post<Meme>(`/api/memes/${id}/remix`, { texts }),
  get: (id: string) => send<Meme & { templateName: string; boxes: number }>(`/api/memes/${id}`),
  report: (id: string) => post<{ ok: boolean }>(`/api/memes/${id}/report`, {}),
  stats: () => send<Stats>("/api/stats"),
  log: () => send<{ entries: LogEntry[]; roadmap: string }>("/api/log"),
};
