import { test, expect } from "vite-plus/test";
import { run } from "./helpers/run.ts";
import stripAnsi from "strip-ansi";

test.sequential("render only last frame in CI", async () => {
  const output = await run("ci", { env: { CI: "true" }, columns: 0 });
  const clean = stripAnsi(output).replaceAll("\r", "");
  // Counter: 0 through Counter: 4 should be absent
  for (let i = 0; i <= 4; i++) {
    expect(clean).not.toContain(`Counter: ${i}`);
  }
  expect(clean).toContain("Counter: 5");
});

test.sequential("render all frames if CI=false", async () => {
  const output = await run("ci", { env: { CI: "false" }, columns: 0 });
  const clean = stripAnsi(output).replaceAll("\r", "");
  for (let i = 0; i <= 5; i++) {
    expect(clean).toContain(`Counter: ${i}`);
  }
});

test.sequential("debug mode in CI", async () => {
  const output = await run("ci-debug", { env: { CI: "true" }, columns: 0 });
  const clean = stripAnsi(output).replaceAll("\r", "");
  const count = clean.split("Hello").length - 1;
  expect(count).toBe(2);
});

test.sequential("debug after exit", async () => {
  const output = await run("ci-debug-after-exit", { env: { CI: "true" }, columns: 0 });
  const clean = stripAnsi(output).replaceAll("\r", "");
  expect(clean).toBe("HelloHello\nDONE");
});
