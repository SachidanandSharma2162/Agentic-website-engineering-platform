import { useEffect, useState } from "react";
import { isAbort } from "./api.ts";

export type Load<T> = { status: "loading" } | { status: "error"; error: unknown } | { status: "ready"; data: T };

interface Settled<T> {
  loader: unknown;
  nonce: number;
  value: Exclude<Load<T>, { status: "loading" }>;
}

/**
 * Load data for the current screen. The request is cancelled when the screen goes away, and its result is ignored, so a
 * slow response can never write into a screen the visitor has already left (a bug found in the design prototype).
 * The loader must be stable (define it at module level or with useCallback); it runs again when it changes or on reload().
 */
export function useLoad<T>(loader: (signal: AbortSignal) => Promise<T>): { state: Load<T>; reload: () => void } {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    loader(ctl.signal).then(
      (data) => !ctl.signal.aborted && setSettled({ loader, nonce, value: { status: "ready", data } }),
      (error) => !isAbort(error) && !ctl.signal.aborted && setSettled({ loader, nonce, value: { status: "error", error } }),
    );
    return () => ctl.abort();
  }, [loader, nonce]);

  // A result only counts for the loader it came from. While reload() is fetching fresh data the previous data stays on
  // screen (so the screen, and any message on it such as "Class added.", is not torn down); a previous error is replaced by
  // the loading state so "Try again" visibly does something.
  let state: Load<T> = { status: "loading" };
  if (settled && settled.loader === loader) {
    const fresh = settled.nonce === nonce;
    if (fresh || settled.value.status === "ready") state = settled.value;
  }
  return { state, reload: () => setNonce((n) => n + 1) };
}

/** Browser time zone, or UTC when it cannot be determined. */
export const visitorZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
