import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  keepLabel?: string;
}

type Confirm = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Confirm | null>(null);

/** Promise-based confirmation in a native modal <dialog> (focus trap, Escape, inert background). Focus starts on the safe choice. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [req, setReq] = useState<{ opts: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (req && d && !d.open) d.showModal();
  }, [req]);

  const confirm = useCallback<Confirm>((opts) => new Promise<boolean>((resolve) => setReq({ opts, resolve })), []);

  const finish = (ok: boolean) => {
    ref.current?.close();
    req?.resolve(ok);
    setReq(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={ref}
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onCancel={(e) => {
          e.preventDefault();
          finish(false);
        }}
      >
        {req && (
          <>
            <h2 id="confirm-title">{req.opts.title}</h2>
            <p id="confirm-body" style={{ marginTop: 8 }}>
              {req.opts.body}
            </p>
            <div className="row">
              <button type="button" className="btn" onClick={() => finish(false)}>
                {req.opts.keepLabel ?? "Keep it"}
              </button>
              <button type="button" className="btn danger" onClick={() => finish(true)}>
                {req.opts.confirmLabel}
              </button>
            </div>
          </>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const c = useContext(ConfirmContext);
  if (!c) throw new Error("useConfirm must be used inside ConfirmProvider");
  return c;
}
