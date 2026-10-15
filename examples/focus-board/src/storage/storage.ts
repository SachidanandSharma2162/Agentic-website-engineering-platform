import { AppDataSchema, LIMITS, emptyData, type AppData } from "../domain/schema.ts";

export const STORAGE_KEY = "focus-board:v1";
export const CORRUPT_BACKUP_KEY = "focus-board:v1:corrupt-backup";

export interface LoadResult {
  data: AppData;
  /** Set when stored data was unreadable or storage is unavailable; shown to the user. */
  notice?: string;
}

/** Persistence boundary. localStorage is the only implementation today; a synced backend would be another one. */
export interface StorageAdapter {
  load(): LoadResult;
  /** Returns an error message if the data could not be persisted. */
  save(data: AppData): string | null;
}

type KV = Pick<Storage, "getItem" | "setItem">;

/** Parse untrusted JSON text into AppData. Never throws. */
export function parseData(text: string): { ok: true; data: AppData } | { ok: false; error: string } {
  if (text.length > LIMITS.maxImportBytes) return { ok: false, error: "That file is larger than 1 MB." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (typeof raw !== "object" || raw === null || !("version" in raw)) {
    return { ok: false, error: "That file is not a Focus Board export." };
  }
  if ((raw as { version: unknown }).version !== 1) {
    return { ok: false, error: "That file uses an unknown version of the Focus Board format." };
  }
  const parsed = AppDataSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `That file has invalid data${issue ? ` (${issue.path.join(".") || "root"}: ${issue.message})` : ""}.` };
  }
  return { ok: true, data: parsed.data };
}

export function serializeData(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

function resolveStorage(): KV | null {
  try {
    const s = globalThis.localStorage;
    const probe = "__focus-board-probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** localStorage-backed adapter. Falls back to memory (with a notice) when storage is blocked or full. */
export function createLocalStorageAdapter(kv: KV | null = resolveStorage()): StorageAdapter {
  return {
    load() {
      if (!kv) return { data: emptyData(), notice: "Browser storage is unavailable, so your data will not be saved after you close this tab. Use Export in Settings to keep a copy." };
      let text: string | null;
      try {
        text = kv.getItem(STORAGE_KEY);
      } catch {
        return { data: emptyData(), notice: "Your saved data could not be read, so you are starting empty." };
      }
      if (text === null) return { data: emptyData() };
      const result = parseData(text);
      if (result.ok) return { data: result.data };
      try {
        kv.setItem(CORRUPT_BACKUP_KEY, text);
      } catch {
        /* best effort: the backup is a courtesy */
      }
      return { data: emptyData(), notice: "Your saved data was unreadable, so you are starting empty. A copy of the unreadable data was kept in this browser." };
    },
    save(data) {
      if (!kv) return "Browser storage is unavailable; changes are not being saved.";
      try {
        kv.setItem(STORAGE_KEY, serializeData(data));
        return null;
      } catch {
        return "Your browser refused to save (storage may be full). Export your data from Settings.";
      }
    },
  };
}

export function createMemoryAdapter(initial: AppData = emptyData()): StorageAdapter & { snapshot(): AppData } {
  let current = initial;
  return {
    load: () => ({ data: current }),
    save(data) {
      current = data;
      return null;
    },
    snapshot: () => current,
  };
}
