import { test as it, expect } from "vite-plus/test";
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
  const ps = term("exit-with-thrown-error");
  try {
    await ps.waitForExit();
  } catch {
    // yoga WASM crash causes non-zero exit; error was already logged to output
  }
  expect(ps.output).toContain("errored");
});

it("don't exit while raw mode is active", async () => {
  const ps = term("exit-double-raw-mode");
  ps.write("q");
  await ps.waitForExit();
  expect(ps.output).toContain("exited");
});

it("exit on exit() with error and static output", async () => {
  const output = await run("exit-with-static");
  expect(output).toContain("errored");
});
