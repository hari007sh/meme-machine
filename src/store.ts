import { DatabaseSync } from "node:sqlite";
import type { MemeRecord, Template, Timings } from "./domain.js";

export type EventKind = "meme" | "search" | "refused" | "busy" | "error";
export type StoredMeme = MemeRecord & { template: Template };

export type Store = {
  saveMeme(r: MemeRecord, template: Template): void;
  getMeme(id: string): StoredMeme | null;
  hideMeme(id: string): boolean;
  unhideMeme(id: string): boolean;
  logEvent(e: { kind: EventKind; timings?: Timings }): void;
  counts(sinceIso?: string): Record<EventKind, number> & { memes: number };
  timings(limit?: number): Timings[];
  purgeOlderThan(days: number): string[];
};

export function openStore(file: string): Store {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS memes (
      id TEXT PRIMARY KEY, situation TEXT NOT NULL, template_id TEXT NOT NULL, template_json TEXT NOT NULL,
      texts_json TEXT NOT NULL, created_at TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, timings_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, at TEXT NOT NULL, timings_json TEXT
    );
    CREATE INDEX IF NOT EXISTS events_kind_at ON events (kind, at);
  `);

  const insertMeme = db.prepare(
    "INSERT INTO memes (id, situation, template_id, template_json, texts_json, created_at, hidden, timings_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const selectMeme = db.prepare("SELECT * FROM memes WHERE id = ?");
  const insertEvent = db.prepare("INSERT INTO events (kind, at, timings_json) VALUES (?, ?, ?)");

  return {
    saveMeme(r, template) {
      insertMeme.run(r.id, r.situation, r.templateId, JSON.stringify(template), JSON.stringify(r.texts), r.createdAt, r.hidden ? 1 : 0, JSON.stringify(r.timings));
    },
    getMeme(id) {
      const row = selectMeme.get(id) as Record<string, string | number> | undefined;
      if (!row) return null;
      return {
        id: String(row.id),
        situation: String(row.situation),
        templateId: String(row.template_id),
        template: JSON.parse(String(row.template_json)),
        texts: JSON.parse(String(row.texts_json)),
        createdAt: String(row.created_at),
        hidden: Number(row.hidden) === 1,
        timings: JSON.parse(String(row.timings_json)),
      };
    },
    hideMeme(id) {
      return Number(db.prepare("UPDATE memes SET hidden = 1 WHERE id = ?").run(id).changes) > 0;
    },
    unhideMeme(id) {
      return Number(db.prepare("UPDATE memes SET hidden = 0 WHERE id = ?").run(id).changes) > 0;
    },
    logEvent(e) {
      insertEvent.run(e.kind, new Date().toISOString(), e.timings ? JSON.stringify(e.timings) : null);
    },
    counts(sinceIso = "1970-01-01") {
      const rows = db.prepare("SELECT kind, COUNT(*) AS n FROM events WHERE at >= ? GROUP BY kind").all(sinceIso) as { kind: EventKind; n: number }[];
      const out = { meme: 0, search: 0, refused: 0, busy: 0, error: 0, memes: 0 };
      for (const r of rows) out[r.kind] = Number(r.n);
      out.memes = Number((db.prepare("SELECT COUNT(*) AS n FROM memes WHERE created_at >= ?").get(sinceIso) as { n: number }).n);
      return out;
    },
    timings(limit = 1000) {
      const rows = db.prepare("SELECT timings_json FROM events WHERE kind = 'meme' AND timings_json IS NOT NULL ORDER BY id DESC LIMIT ?").all(limit) as { timings_json: string }[];
      return rows.map((r) => JSON.parse(r.timings_json));
    },
    purgeOlderThan(days) {
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
      const ids = (db.prepare("SELECT id FROM memes WHERE created_at < ?").all(cutoff) as { id: string }[]).map((r) => r.id);
      db.prepare("DELETE FROM memes WHERE created_at < ?").run(cutoff);
      return ids;
    },
  };
}
