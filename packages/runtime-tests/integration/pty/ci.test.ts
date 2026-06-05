import { test as it, expect } from "vite-plus/test";
import { run } from "./helpers/run.ts";
import stripAnsi from "strip-ansi";

it("render only last frame in CI", async () => {
  const output = await run("ci", { env: { CI: "true" }, columns: 0 });
  const clean = stripAnsi(output).replaceAll("\r", "");
  for (let i = 0; i <= 4; i++) {
    expect(clean).not.toContain(`Counter: ${i}`);
  }
  expect(clean).toContain("Counter: 5");
});

it("render all frames if CI=false", async () => {
  const output = await run("ci", { env: { CI: "false" }, columns: 0 });
  const clean = stripAnsi(output).replaceAll("\r", "");
  expect(clean).toContain("Counter:");
  expect(clean).toContain("Counter: 5");
  expect(clean).toContain("#1");
});

it("debug mode in CI", async () => {
  const output = await run("ci-debug", { env: { CI: "true" }, columns: 0 });
  const clean = stripAnsi(output).replaceAll("\r", "");
  expect(clean).toContain("Hello");
});

it("debug after exit", async () => {
  const output = await run("ci-debug-after-exit", { env: { CI: "true" }, columns: 0 });
  const clean = stripAnsi(output).replaceAll("\r", "");
  expect(clean).toContain("Hello");
  expect(clean).toContain("DONE");
});

// Byte-level Ink parity for the DEBUG + non-interactive (CI=true) unmount stream.
// Ink (ink.tsx @ v7.0.4): the debug onRender writes `fullStaticOutput + output`
// per render with NO trailing newline (550-558); at unmount settleThrottle leaves
// shouldRenderFinalFrame=true for debug (throttledOnRender is undefined → 749-762),
// so a final onRender RE-EMITS the last frame; then finishUnmount writes a single
// trailing "\n" for the non-interactive+debug case (812-819). For the single
// static-free "Hello" render (fullStaticOutput="" , lastOutput="Hello") the exact
// stdout byte stream is "Hello" + "Hello" + "\n". The PTY translates the lone "\n"
// to "\r\n", so the raw capture must end with exactly "HelloHello\r\n".
// The ci-debug-bytes fixture uses a function slot so no Vue dev warning is
// interleaved — the raw stream is exactly the debug frames.
it("debug mode in CI re-emits the final frame and writes a trailing newline (Ink byte parity)", async () => {
  const output = await run("ci-debug-bytes", { env: { CI: "true" }, columns: 0 });
  expect(output).toBe("HelloHello\r\n");
});
