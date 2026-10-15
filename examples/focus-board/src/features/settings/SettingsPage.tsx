import { useRef, useState, type ChangeEvent } from "react";
import { LIMITS } from "../../domain/schema.ts";
import { parseData, serializeData } from "../../storage/storage.ts";
import { useStore } from "../../state/store.tsx";
import { useConfirm } from "../../ui/Confirm.tsx";
import { useToast } from "../../ui/Toast.tsx";

export function SettingsPage() {
  const store = useStore();
  const confirm = useConfirm();
  const toast = useToast();
  const [importError, setImportError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const exportData = () => {
    const url = URL.createObjectURL(new Blob([serializeData(store.data)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `focus-board-${store.today}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`Exported focus-board-${store.today}.json`);
  };

  const importFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setImportError("");
    if (!file) return;
    const reset = () => {
      if (fileInput.current) fileInput.current.value = "";
    };
    if (file.size > LIMITS.maxImportBytes) {
      setImportError("That file is larger than 1 MB. Nothing was changed.");
      reset();
      return;
    }
    const result = parseData(await file.text());
    if (!result.ok) {
      setImportError(`${result.error} Nothing was changed.`);
      reset();
      return;
    }
    const { tasks, habits } = result.data;
    const ok = await confirm({
      title: "Replace all data?",
      body: `This will replace your current data with ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} and ${habits.length} ${habits.length === 1 ? "habit" : "habits"} from the file.`,
      confirmLabel: "Replace",
      danger: true,
    });
    reset();
    if (!ok) return;
    store.replaceAll(result.data);
    toast("Import complete");
  };

  const resetAll = async () => {
    const ok = await confirm({ title: "Delete all data?", body: "This cannot be undone. Export first if you might want it back.", confirmLabel: "Delete everything", danger: true });
    if (!ok) return;
    store.resetAll();
    toast("All data deleted");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Your data</p>
          <h1>Settings</h1>
        </div>
      </div>
      <div className="stack settings">
        <section className="card" aria-labelledby="exp-h">
          <h2 id="exp-h">Export</h2>
          <p>Download everything as a JSON file. Your data lives only in this browser, so export regularly.</p>
          <button type="button" className="btn primary" onClick={exportData}>
            Download JSON
          </button>
        </section>
        <section className="card" aria-labelledby="imp-h">
          <h2 id="imp-h">Import</h2>
          <p>Replace your data with a previously exported file. Nothing changes unless the file is valid and you confirm.</p>
          <label className="field">
            <span>Choose a .json file (max 1 MB)</span>
            <input ref={fileInput} className="input" type="file" accept="application/json,.json" onChange={importFile} style={{ paddingTop: 10 }} />
          </label>
          <p className="err" role="alert">
            {importError}
          </p>
        </section>
        <section className="card" aria-labelledby="rst-h">
          <h2 id="rst-h">Reset</h2>
          <p>Erase all tasks, habits and check-ins from this browser.</p>
          <button type="button" className="btn danger" onClick={resetAll}>
            Delete all data…
          </button>
        </section>
      </div>
    </>
  );
}
