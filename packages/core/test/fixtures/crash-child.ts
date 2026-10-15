// Runs the orchestrator against a real on-disk database and then hangs inside task "b" so the parent test can kill this
// process mid-task. Usage: node crash-child.ts <db> <counterFile> <startedMarker>
import { appendFileSync, writeFileSync } from "node:fs";
import { Orchestrator, StateStore } from "../../src/index.ts";

const [db, counter, marker] = process.argv.slice(2) as [string, string, string];
const store = new StateStore(db);
const orch = new Orchestrator({
  store,
  executors: {
    work: async ({ task }) => {
      appendFileSync(counter, task.id);
      if (task.id === "b") {
        writeFileSync(marker, "running"); // tell the parent we are inside task b
        await new Promise(() => {}); // never finishes: the parent kills this process
      }
      return { ok: true };
    },
  },
});
await orch.run("p1");
