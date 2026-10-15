import { expect, it } from "vitest";

// This file must not import zod or the schema statically: zod probes for eval support when a schema is built, once per
// process, so the probe has to happen inside the observation window below to be seen.
it("never probes for eval support, which a strict Content-Security-Policy would report as a violation", async () => {
  const probes: unknown[][] = [];
  const Real = globalThis.Function;
  globalThis.Function = new Proxy(Real, {
    construct(target, args) {
      if (args[0] === "") probes.push(args); // zod's probe is `new Function("")`
      return Reflect.construct(target, args);
    },
  });
  try {
    const { AppDataSchema } = await import("../../src/domain/schema.ts");
    AppDataSchema.parse({ version: 1, tasks: [{ id: "a", title: "t", priority: "high", done: false, today: false, createdAt: "x" }], habits: [] });
  } finally {
    globalThis.Function = Real;
  }
  expect(probes).toEqual([]);
});
