import { readFileSync, writeFileSync } from "node:fs";
const f = "packages/providers/src/cloudflare-pages.ts";
let s = readFileSync(f, "utf8");
const a = `    const r = await req.runner.run(
      "npx",
      ["wrangler", "pages", "deploy", req.distDir, "--project-name", req.projectName, "--branch", req.branch],
      { timeoutMs: 10 * 60_000 },
    );
    const log = \`\${r.stdout}\n\${r.stderr}\`.trim();
    if (r.code !== 0) return { ok: false, log, error: \`wrangler exited with code \${r.code}\${r.timedOut ? " (timed out)" : ""}\` };
`;
if (!s.includes(a)) throw new Error("deploy block not found");
s = s.replace(a, () => `    const deployArgs = ["wrangler", "pages", "deploy", req.distDir, "--project-name", req.projectName, "--branch", req.branch];
    let r = await req.runner.run("npx", deployArgs, { timeoutMs: 10 * 60_000 });
    let log = \`\${r.stdout}\n\${r.stderr}\`.trim();

    // First deployment of a new site: the Pages project does not exist yet. Creating it is part of the approved scope
    // (Gates C and D name this exact project), so create it and retry once. Any other failure is reported as is.
    if (r.code !== 0 && MISSING_PROJECT.test(log)) {
      const created = await req.runner.run("npx", ["wrangler", "pages", "project", "create", req.projectName, "--production-branch", req.branch], { timeoutMs: 2 * 60_000 });
      const createLog = \`\${created.stdout}\n\${created.stderr}\`.trim();
      if (created.code !== 0) {
        return { ok: false, log: \`\${log}\n--- project create ---\n\${createLog}\`, error: \`creating Pages project "\${req.projectName}" failed (wrangler exit \${created.code})\` };
      }
      r = await req.runner.run("npx", deployArgs, { timeoutMs: 10 * 60_000 });
      log = \`\${log}\n--- project create ---\n\${createLog}\n--- deploy retry ---\n\${r.stdout}\n\${r.stderr}\`.trim();
    }
    if (r.code !== 0) return { ok: false, log, error: \`wrangler exited with code \${r.code}\${r.timedOut ? " (timed out)" : ""}\` };
`);
s = s.replace(`const VALID_NAME =`, `const MISSING_PROJECT = /Pages project "[^"]+" does not exist/i;\nconst VALID_NAME =`);
writeFileSync(f, s);
