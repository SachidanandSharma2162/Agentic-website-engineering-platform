const MIN_SECRET_LENGTH = 6;

const PATTERNS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, "Bearer [REDACTED]"],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, "[REDACTED]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[REDACTED]"],
  // name=value / name: value where the name looks sensitive; keep the name for debuggability
  [/\b([A-Za-z0-9_.-]*(?:api[_-]?key|token|secret|passw(?:or)?d|credential)[A-Za-z0-9_.-]*)(\s*[=:]\s*)(["']?)[^\s"']+\3/gi, "$1$2[REDACTED]"],
];

/** Remove known secret values and common secret shapes from text destined for logs or reports. */
export function redact(text: string, secrets: Iterable<string> = []): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= MIN_SECRET_LENGTH) out = out.split(s).join("[REDACTED]");
  }
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}
