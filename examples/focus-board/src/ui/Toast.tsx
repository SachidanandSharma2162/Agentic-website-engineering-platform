import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export const TOAST_MS = 6000;

interface ToastItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

type Show = (message: string, action?: { label: string; onAction: () => void }) => void;
const ToastContext = createContext<Show | null>(null);

let nextToastId = 0;

/** One toast at a time, announced politely to screen readers, auto-dismissed after 6 seconds. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);

  const show = useCallback<Show>((message, action) => {
    nextToastId += 1;
    setToast({ id: nextToastId, message, actionLabel: action?.label, onAction: action?.onAction });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  const s = useContext(ToastContext);
  if (!s) throw new Error("useToast must be used inside ToastProvider");
  return s;
}
