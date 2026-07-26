import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

test("visual hosts and single-root components follow Vue v-show behavior in production", async () => {
  const fixture = fileURLToPath(
    new URL("../subprocess-fixtures/v-show-production.mjs", import.meta.url),
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    FORCE_COLOR: "0",
  };
  delete env["NO_COLOR"];
  const child = spawn(process.execPath, [fixture], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const exit = await new Promise<{
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });

  expect(exit).toEqual({ code: 0, signal: null });
  expect(stderr).toBe("");
  expect(stdout).toBe("v-show-production: ok\n");
});
