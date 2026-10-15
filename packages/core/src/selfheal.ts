export interface CheckResult {
  ok: boolean;
  /** Captured diagnostic output (already redacted by the caller). */
  output: string;
}

export interface Diagnosis {
  /** A concrete, evidence-based root cause. Blank/vague values are rejected. */
  rootCause: string;
  plan: string;
}

export interface FixResult {
  changedFiles: string[];
  /** Undo the change when it is rejected. */
  revert?: () => Promise<void>;
}

export interface HealAttempt {
  n: number;
  diagnosis?: Diagnosis;
  changedFiles: string[];
  outcome: "fixed" | "still-failing" | "regression-failed" | "rejected-forbidden-change" | "no-op-fix" | "no-diagnosis";
  evidence: string;
}

export interface HealReport {
  status: "passed" | "blocked";
  /** Number of repair attempts consumed (0 if the check passed on the first run). */
  attemptsUsed: number;
  attempts: HealAttempt[];
  /** Output of the last failing check, preserved for diagnostics when blocked. */
  lastFailure?: string;
}

export interface HealOptions {
  maxAttempts: number;
  /** The targeted check that is failing. */
  check: () => Promise<CheckResult>;
  /** Broader suite run after the targeted check passes. */
  regression: () => Promise<CheckResult>;
  diagnose: (failure: CheckResult, history: HealAttempt[]) => Promise<Diagnosis | undefined>;
  fix: (diagnosis: Diagnosis, failure: CheckResult) => Promise<FixResult>;
  /**
   * Files a repair may never modify (tests, lint/security config...). Guards against
   * "fixing" a failure by weakening the check.
   */
  forbiddenChange?: RegExp[];
  log?: (message: string) => void;
}

const MIN_ROOT_CAUSE = 12;

/**
 * Bounded repair loop: diagnose -> smallest fix -> rerun failing check -> rerun regression.
 * Never retries without a diagnosis, never accepts changes to protected files, and gives up
 * (status "blocked", failure preserved) when the attempt budget is spent.
 */
export async function selfHeal(opts: HealOptions): Promise<HealReport> {
  const log = opts.log ?? (() => {});
  const attempts: HealAttempt[] = [];
  let failure = await opts.check();
  if (failure.ok) return { status: "passed", attemptsUsed: 0, attempts };

  for (let n = 1; n <= opts.maxAttempts; n++) {
    const diagnosis = await opts.diagnose(failure, attempts);
    if (!diagnosis || diagnosis.rootCause.trim().length < MIN_ROOT_CAUSE) {
      attempts.push({ n, changedFiles: [], outcome: "no-diagnosis", evidence: failure.output });
      log(`attempt ${n}: no usable diagnosis, refusing speculative fix`);
      return { status: "blocked", attemptsUsed: n, attempts, lastFailure: failure.output };
    }

    const fix = await opts.fix(diagnosis, failure);

    const forbidden = fix.changedFiles.filter((f) => opts.forbiddenChange?.some((re) => re.test(f.replaceAll("\\", "/"))));
    if (forbidden.length > 0) {
      await fix.revert?.();
      attempts.push({
        n,
        diagnosis,
        changedFiles: fix.changedFiles,
        outcome: "rejected-forbidden-change",
        evidence: `change touched protected files: ${forbidden.join(", ")}`,
      });
      log(`attempt ${n}: rejected, touched protected files`);
      continue;
    }
    if (fix.changedFiles.length === 0) {
      attempts.push({ n, diagnosis, changedFiles: [], outcome: "no-op-fix", evidence: "fix changed no files" });
      continue;
    }

    const recheck = await opts.check();
    if (!recheck.ok) {
      failure = recheck;
      attempts.push({ n, diagnosis, changedFiles: fix.changedFiles, outcome: "still-failing", evidence: recheck.output });
      log(`attempt ${n}: check still failing`);
      continue;
    }

    const reg = await opts.regression();
    if (!reg.ok) {
      failure = reg;
      attempts.push({ n, diagnosis, changedFiles: fix.changedFiles, outcome: "regression-failed", evidence: reg.output });
      log(`attempt ${n}: fix introduced a regression`);
      continue;
    }

    attempts.push({ n, diagnosis, changedFiles: fix.changedFiles, outcome: "fixed", evidence: reg.output });
    log(`attempt ${n}: fixed and regression suite passed`);
    return { status: "passed", attemptsUsed: n, attempts };
  }

  return { status: "blocked", attemptsUsed: opts.maxAttempts, attempts, lastFailure: failure.output };
}
