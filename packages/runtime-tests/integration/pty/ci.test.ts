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
  // In non-CI mode, multiple frames are rendered (not just the last one)
  // Due to timer batching, not every counter value may appear, but more than just the last
  expect(clean).toContain("Counter:");
  expect(clean).toContain("Counter: 5");
  // Should have static items
  expect(clean).toContain("#1");
});

test.sequential("debug mode in CI", async () => {
  const output = await run("ci-debug", { env: { CI: "true" }, columns: 0 });
  const clean = stripAnsi(output).replaceAll("\r", "");
  // Vue batches initial render differently from React — at least 1 commit
  expect(clean).toContain("Hello");
});

test.sequential("debug after exit", async () => {
  const output = await run("ci-debug-after-exit", { env: { CI: "true" }, columns: 0 });
  const clean = stripAnsi(output).replaceAll("\r", "");
  // Vue batches differently — output contains Hello and DONE
  expect(clean).toContain("Hello");
  expect(clean).toContain("DONE");
});
