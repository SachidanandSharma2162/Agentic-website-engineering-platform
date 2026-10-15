import { DatabaseSync } from "node:sqlite";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { Approval, EventRecord, Project, Task, type GateId, type TaskStatus } from "./schema.ts";

const now = () => new Date().toISOString();

/**
 * Persistent state store: SQLite (node:sqlite, no native build) for current state
 * plus an append-only JSONL event log for the audit trail.
 */
export class StateStore {
  readonly db: DatabaseSync;
  readonly eventLogPath: string | undefined;

  constructor(dbPath: string, eventLogPath?: string) {
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT NOT NULL, project_id TEXT NOT NULL, status TEXT NOT NULL, seq INTEGER NOT NULL,
        json TEXT NOT NULL, PRIMARY KEY (project_id, id));
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, gate TEXT NOT NULL, seq INTEGER NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, json TEXT NOT NULL);
    `);
    this.eventLogPath = eventLogPath;
    if (eventLogPath) mkdirSync(dirname(eventLogPath), { recursive: true });
  }

  close(): void {
    this.db.close();
  }

  // ---- projects ----
  saveProject(p: Project): void {
    const v = Project.parse({ ...p, updatedAt: now() });
    this.db
      .prepare("INSERT INTO projects (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json")
      .run(v.id, JSON.stringify(v));
  }

  getProject(id: string): Project | undefined {
    const row = this.db.prepare("SELECT json FROM projects WHERE id = ?").get(id) as { json: string } | undefined;
    return row ? Project.parse(JSON.parse(row.json)) : undefined;
  }

  listProjects(): Project[] {
    const rows = this.db.prepare("SELECT json FROM projects").all() as { json: string }[];
    return rows.map((r) => Project.parse(JSON.parse(r.json)));
  }

  // ---- tasks ----
  saveTask(t: Task): void {
    const v = Task.parse(t);
    const existing = this.db
      .prepare("SELECT seq FROM tasks WHERE project_id = ? AND id = ?")
      .get(v.projectId, v.id) as { seq: number } | undefined;
    const seq =
      existing?.seq ??
      (this.db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM tasks WHERE project_id = ?").get(v.projectId) as { n: number }).n;
    this.db
      .prepare(
        `INSERT INTO tasks (id, project_id, status, seq, json) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(project_id, id) DO UPDATE SET status = excluded.status, json = excluded.json`,
      )
      .run(v.id, v.projectId, v.status, seq, JSON.stringify(v));
  }

  getTask(projectId: string, id: string): Task | undefined {
    const row = this.db.prepare("SELECT json FROM tasks WHERE project_id = ? AND id = ?").get(projectId, id) as
      | { json: string }
      | undefined;
    return row ? Task.parse(JSON.parse(row.json)) : undefined;
  }

  listTasks(projectId: string): Task[] {
    const rows = this.db.prepare("SELECT json FROM tasks WHERE project_id = ? ORDER BY seq").all(projectId) as {
      json: string;
    }[];
    return rows.map((r) => Task.parse(JSON.parse(r.json)));
  }

  updateTask(projectId: string, id: string, patch: Partial<Task>): Task {
    const cur = this.getTask(projectId, id);
    if (!cur) throw new Error(`Unknown task ${id}`);
    const next = Task.parse({ ...cur, ...patch });
    this.saveTask(next);
    return next;
  }

  countByStatus(projectId: string): Record<TaskStatus, number> {
    const out = { PLANNED: 0, READY: 0, RUNNING: 0, BLOCKED: 0, NEEDS_APPROVAL: 0, FAILED: 0, COMPLETED: 0 };
    for (const t of this.listTasks(projectId)) out[t.status]++;
    return out;
  }

  // ---- approvals ----
  recordApproval(a: Omit<Approval, "id" | "at">): Approval {
    const v = Approval.parse({ ...a, id: randomUUID(), at: now() });
    const seq = (
      this.db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM approvals WHERE project_id = ?").get(v.projectId) as {
        n: number;
      }
    ).n;
    this.db
      .prepare("INSERT INTO approvals (id, project_id, gate, seq, json) VALUES (?, ?, ?, ?, ?)")
      .run(v.id, v.projectId, v.gate, seq, JSON.stringify(v));
    this.appendEvent({
      projectId: v.projectId,
      type: `approval.${v.decision}`,
      data: { gate: v.gate, scope: v.scope, by: v.by },
    });
    return v;
  }

  listApprovals(projectId: string, gate?: GateId): Approval[] {
    const rows = (
      gate
        ? this.db.prepare("SELECT json FROM approvals WHERE project_id = ? AND gate = ? ORDER BY seq").all(projectId, gate)
        : this.db.prepare("SELECT json FROM approvals WHERE project_id = ? ORDER BY seq").all(projectId)
    ) as { json: string }[];
    return rows.map((r) => Approval.parse(JSON.parse(r.json)));
  }

  // ---- events ----
  appendEvent(e: { projectId: string; type: string; taskId?: string; data?: Record<string, unknown> }): EventRecord {
    const v = EventRecord.parse({ ...e, ts: now(), data: e.data ?? {} });
    const line = JSON.stringify(v);
    this.db.prepare("INSERT INTO events (project_id, json) VALUES (?, ?)").run(v.projectId, line);
    if (this.eventLogPath) appendFileSync(this.eventLogPath, line + "\n");
    return v;
  }

  listEvents(projectId: string, limit = 200): EventRecord[] {
    const rows = this.db
      .prepare("SELECT json FROM events WHERE project_id = ? ORDER BY seq DESC LIMIT ?")
      .all(projectId, limit) as { json: string }[];
    return rows.map((r) => EventRecord.parse(JSON.parse(r.json))).reverse();
  }
}
