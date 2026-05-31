import { test as it, expect } from "vite-plus/test";
import stripAnsi from "strip-ansi";
import { run } from "./helpers/run.ts";
import term from "./helpers/term.ts";

it("exit normally without unmount() or exit()", async () => {
  const output = await run("exit-normally");
  expect(output).toContain("exited");
});

it("exit on unmount()", async () => {
  const output = await run("exit-on-unmount");
  expect(output).toContain("exited");
});

it("exit when app finishes execution", async () => {
  await expect(run("exit-on-finish")).resolves.toBeDefined();
});

it("exit on exit()", async () => {
  const output = await run("exit-on-exit");
  expect(output).toContain("exited");
});

it("exit on exit() with error", async () => {
  const output = await run("exit-on-exit-with-error");
  expect(output).toContain("errored");
});

it("exit on exit() with error with value property", async () => {
  const output = await run("exit-on-exit-with-error-value-property");
  expect(output).toContain("errored");
});

it("exit on exit() with result value", async () => {
  const output = await run("exit-on-exit-with-result");
  expect(output).toContain("result:hello from vue-tui");
});

it("exit on exit() with object result", async () => {
  const output = await run("exit-on-exit-with-value-object");
  expect(output).toContain("result:hello from vue-tui object");
});

it("exit on exit() with raw mode", async () => {
  const output = await run("exit-raw-on-exit");
  expect(output).toContain("exited");
});

it("exit on exit() with raw mode with error", async () => {
  const output = await run("exit-raw-on-exit-with-error");
  expect(output).toContain("errored");
});

it("exit on unmount() with raw mode", async () => {
  const output = await run("exit-raw-on-unmount");
  expect(output).toContain("exited");
});

it("exit with thrown error", async () => {
  // run() rejects on a non-zero exit code; the fixture catches the rejected
  // waitUntilExit, logs "errored", and exits 0 deterministically (Ink exit.tsx:71-74).
  const output = await run("exit-with-thrown-error");
  expect(output).toContain("errored");
});

it("don't exit while raw mode is active", async () => {
  // Port of Ink exit.tsx:100-114 ("don't exit while raw mode is active"). The
  // fixture keeps raw mode enabled and writes __READY__ after 500ms. With raw
  // mode active and no input, the process must STAY ALIVE — Node's keep-alive
  // (the raw-mode stdin handle) blocks exit. We wait ~500ms with NO input and
  // confirm it has not exited, THEN send 'q' to trigger unmount + exit.
  const ps = term("exit-double-raw-mode");

  // After __READY__ (resolved internally by the term helper), wait 500ms and
  // ensure the process has NOT exited (no input has been sent yet).
  const exitedDuringWait = await Promise.race([
    ps.waitForExitInfo().then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 500)),
  ]);
  expect(exitedDuringWait).toBe(false);

  // Now send 'q': the fixture unmounts and the process exits cleanly.
  ps.write("q");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("exit when DEV is set", async () => {
  // Port of Ink exit.tsx:133-142 ("exit when DEV is set"). DEV is inert in
  // vue-tui (no React DevTools hookup), so exit-normally must still exit cleanly.
  const output = await run("exit-normally", { env: { DEV: "true" } });
  expect(output).toContain("exited");
});

it("exit on exit() with error and static output", async () => {
  const output = await run("exit-with-static");
  expect(output).toContain("errored");

  // Static items A/B/C must each render EXACTLY once — not duplicated (Ink #397,
  // exit.tsx:144-155). With the fixture's function slots there are no Vue warns
  // polluting stdout, so the body lines are clean single occurrences.
  const lines = stripAnsi(output).split(/\r?\n/);
  expect(lines.filter((line) => line === "A")).toHaveLength(1);
  expect(lines.filter((line) => line === "B")).toHaveLength(1);
  expect(lines.filter((line) => line === "C")).toHaveLength(1);
});
