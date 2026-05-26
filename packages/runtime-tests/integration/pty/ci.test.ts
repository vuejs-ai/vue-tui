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
