import { describe, expect, it } from "vitest";
import { selfHeal } from "../src/index.ts";

/** A tiny in-memory "codebase": the defect is fixed when `value` becomes 2. */
function world(initial: number) {
  const s = { value: initial, regressionOk: true };
  return {
    s,
    check: async () => (s.value === 2 ? { ok: true, output: "pass" } : { ok: false, output: `expected 2, got ${s.value}` }),
    regression: async () => (s.regressionOk ? { ok: true, output: "all green" } : { ok: false, output: "regression!" }),
  };
}

const goodDiagnosis = async () => ({ rootCause: "off-by-one in streak calculation", plan: "use >= instead of >" });

describe("selfHeal", () => {
  it("passes immediately with zero attempts when nothing is failing", async () => {
    const w = world(2);
    const r = await selfHeal({ maxAttempts: 3, ...w, diagnose: goodDiagnosis, fix: async () => ({ changedFiles: [] }) });
    expect(r).toMatchObject({ status: "passed", attemptsUsed: 0 });
  });

  it("fixes a real defect and verifies regression", async () => {
    const w = world(1);
    const r = await selfHeal({
      maxAttempts: 3, ...w, diagnose: goodDiagnosis,
      fix: async () => { w.s.value = 2; return { changedFiles: ["src/streak.ts"] }; },
    });
    expect(r.status).toBe("passed");
    expect(r.attemptsUsed).toBe(1);
    expect(r.attempts[0]?.outcome).toBe("fixed");
  });

  it("blocks after the attempt budget and preserves the last failure", async () => {
    const w = world(1);
    let fixes = 0;
    const r = await selfHeal({
      maxAttempts: 3, ...w, diagnose: goodDiagnosis,
      fix: async () => { fixes++; w.s.value = 5; return { changedFiles: ["src/a.ts"] }; },
    });
    expect(fixes).toBe(3);
    expect(r.status).toBe("blocked");
    expect(r.lastFailure).toContain("got 5");
    expect(r.attempts.every((a) => a.outcome === "still-failing")).toBe(true);
  });

  it("refuses speculative fixes without a real diagnosis", async () => {
    const w = world(1);
    let fixes = 0;
    const r = await selfHeal({
      maxAttempts: 3, ...w,
      diagnose: async () => ({ rootCause: "dunno", plan: "try stuff" }),
      fix: async () => { fixes++; return { changedFiles: ["x.ts"] }; },
    });
    expect(fixes).toBe(0);
    expect(r).toMatchObject({ status: "blocked", attemptsUsed: 1 });
    expect(r.attempts[0]?.outcome).toBe("no-diagnosis");
  });

  it("rejects and reverts fixes that modify tests or security config", async () => {
    const w = world(1);
    let reverted = 0;
    const r = await selfHeal({
      maxAttempts: 2, ...w, diagnose: goodDiagnosis,
      forbiddenChange: [/\.test\.tsx?$/, /(^|\/)tests?\//, /security/],
      fix: async () => { w.s.value = 2; return { changedFiles: ["src\\streak.test.ts"], revert: async () => { reverted++; w.s.value = 1; } }; },
    });
    expect(reverted).toBe(2);
    expect(r.status).toBe("blocked");
    expect(r.attempts.every((a) => a.outcome === "rejected-forbidden-change")).toBe(true);
  });

  it("treats a fix that breaks the regression suite as a failed attempt", async () => {
    const w = world(1);
    let n = 0;
    const r = await selfHeal({
      maxAttempts: 3, ...w, diagnose: goodDiagnosis,
      fix: async () => { n++; w.s.value = 2; w.s.regressionOk = n >= 2; return { changedFiles: ["a.ts"] }; },
    });
    expect(r.status).toBe("passed");
    expect(r.attempts.map((a) => a.outcome)).toEqual(["regression-failed", "fixed"]);
  });

  it("counts a no-op fix as a consumed attempt", async () => {
    const w = world(1);
    const r = await selfHeal({ maxAttempts: 2, ...w, diagnose: goodDiagnosis, fix: async () => ({ changedFiles: [] }) });
    expect(r.status).toBe("blocked");
    expect(r.attempts.map((a) => a.outcome)).toEqual(["no-op-fix", "no-op-fix"]);
  });
});
