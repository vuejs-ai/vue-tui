import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

interface FixtureResult {
  readonly forcedTruecolorStream: string;
  readonly plainTty: string;
  readonly stream: string;
  readonly tty: string;
}

function sanitizedChildEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.NO_COLOR;
  delete environment.NODE_DISABLE_COLORS;
  delete environment.FORCE_COLOR;
  delete environment.NODE_NO_WARNINGS;
  return environment;
}

async function runFixture(environment: NodeJS.ProcessEnv): Promise<FixtureResult> {
  const fixture = fileURLToPath(new URL("./fixtures/custom-stdout-styling.mjs", import.meta.url));
  const child = spawn(process.execPath, [fixture], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env: environment,
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
  return JSON.parse(stdout) as FixtureResult;
}

test("the selected stdout owns terminal styling capability", async () => {
  const result = await runFixture(sanitizedChildEnvironment());
  expect(result.tty).toContain("\u001b[38;2;255;0;128mstyled\u001b[39m");
  expect(result.stream).toBe("styled\n");
  expect(result.forcedTruecolorStream).toBe(
    "\u001b[1m\u001b[38;2;255;0;128mstyled\u001b[39m\u001b[22m\n",
  );
  expect(result.plainTty).toContain("styled");
  expect(result.plainTty).not.toContain("\u001b[38;");
  expect(result.plainTty).not.toContain("\u001b[1m");
});

test("mounted automatic color reads FORCE_COLOR from the process environment", async () => {
  const environment = sanitizedChildEnvironment();
  environment.FORCE_COLOR = "2";

  const result = await runFixture(environment);

  expect(result.stream).toBe("\u001b[1m\u001b[38;5;199mstyled\u001b[39m\u001b[22m\n");
});

test("mounted automatic color applies NO_COLOR without removing bold", async () => {
  const environment = sanitizedChildEnvironment();
  environment.NO_COLOR = "1";

  const result = await runFixture(environment);

  expect(result.tty).toContain("\u001b[1mstyled\u001b[22m");
  expect(result.tty).not.toContain("\u001b[38;");
});
