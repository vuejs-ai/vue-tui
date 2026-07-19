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

it("an active semantic input route keeps the app alive until it exits", async () => {
  // The fixture owns a useInput route and writes __READY__ after 500ms. Its
  // stdin ref keeps the process alive until q reaches the route and exits.
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

it("an input-free final-output app never acquires terminal input ownership", async () => {
  const ps = term("input-free-final-output");
  try {
    await ps.waitForOutput((output) => output.includes("__INPUT_FREE_EXIT__"));
    await ps.waitForExit();
    const expected = {
      isTTY: true,
      rawModeCalls: [],
      refCalls: [],
      dataListenerTransitions: [],
      dataListenerDelta: 0,
      isRaw: false,
    };
    const mounted = ps.output.match(/__INPUT_FREE_MOUNT__(\{[^\r\n]+\})/);
    const exited = ps.output.match(/__INPUT_FREE_EXIT__(\{[^\r\n]+\})/);

    expect(mounted).not.toBeNull();
    expect(exited).not.toBeNull();
    expect(JSON.parse(mounted![1]!)).toEqual(expected);
    expect(JSON.parse(exited![1]!)).toEqual(expected);
    expect(ps.output).not.toContain("\x1b[?u");
    expect(ps.output).not.toMatch(/\x1b\[>\d+u/);
    expect(ps.output).not.toContain("\x1b[<u");
    expect(stripAnsi(ps.output).match(/FINAL_OUTPUT_NO_INPUT/g)).toHaveLength(1);
  } finally {
    ps.killNow("SIGKILL");
  }
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
