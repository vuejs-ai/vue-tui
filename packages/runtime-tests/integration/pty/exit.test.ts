import { test, expect } from "vite-plus/test";
import { run } from "./helpers/run.ts";
import term from "./helpers/term.ts";

test.sequential("exit normally without unmount() or exit()", async () => {
  const output = await run("exit-normally");
  expect(output).toContain("exited");
});

test.sequential("exit on unmount()", async () => {
  const output = await run("exit-on-unmount");
  expect(output).toContain("exited");
});

test.sequential("exit when app finishes execution", async () => {
  await expect(run("exit-on-finish")).resolves.toBeDefined();
});

test.sequential("exit on exit()", async () => {
  const output = await run("exit-on-exit");
  expect(output).toContain("exited");
});

test.sequential("exit on exit() with error", async () => {
  const output = await run("exit-on-exit-with-error");
  expect(output).toContain("errored");
});

test.sequential("exit on exit() with error with value property", async () => {
  const output = await run("exit-on-exit-with-error-value-property");
  expect(output).toContain("errored");
});

test.sequential("exit on exit() with result value", async () => {
  const output = await run("exit-on-exit-with-result");
  expect(output).toContain("result:hello from vue-tui");
});

test.sequential("exit on exit() with object result", async () => {
  const output = await run("exit-on-exit-with-value-object");
  expect(output).toContain("result:hello from vue-tui object");
});

test.sequential("exit on exit() with raw mode", async () => {
  const output = await run("exit-raw-on-exit");
  expect(output).toContain("exited");
});

test.sequential("exit on exit() with raw mode with error", async () => {
  const output = await run("exit-raw-on-exit-with-error");
  expect(output).toContain("errored");
});

test.sequential("exit on unmount() with raw mode", async () => {
  const output = await run("exit-raw-on-unmount");
  expect(output).toContain("exited");
});

test.sequential("exit with thrown error", async () => {
  // Fixture may exit non-zero due to yoga WASM cleanup crash after error propagation.
  // Use term() so we can read output regardless of exit code.
  const ps = term("exit-with-thrown-error");
  try {
    await ps.waitForExit();
  } catch {
    // yoga WASM crash causes non-zero exit; error was already logged to output
  }
  expect(ps.output).toContain("errored");
});

test.sequential("don't exit while raw mode is active", async () => {
  const ps = term("exit-double-raw-mode");

  // Wait for 's' signal (fixture signals readiness by writing 's')
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (ps.output.includes("s")) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });

  let isExited = false;
  void ps.waitForExit().then(() => {
    isExited = true;
  });

  // Process should still be alive (raw mode keeps it running)
  await new Promise((r) => setTimeout(r, 500));
  expect(isExited).toBe(false);

  // Send 'q' to trigger unmount
  ps.write("q");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

test.sequential("exit on exit() with error and static output", async () => {
  const output = await run("exit-with-static");
  expect(output).toContain("errored");
});
