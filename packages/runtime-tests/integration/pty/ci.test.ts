import { test as it, expect } from "vite-plus/test";
import { run } from "./helpers/run.ts";
import stripAnsi from "strip-ansi";

it("keeps TTY live updates when CI=true", async () => {
  const output = await run("ci", { env: { CI: "true" }, columns: 0 });
  const clean = stripAnsi(output).replaceAll("\r", "");
  expect(clean).toContain("Counter: 0");
  expect(clean).toContain("Counter: 5");
  expect(clean).toContain("#1");
});

it("keeps TTY live updates when CI=false", async () => {
  const output = await run("ci", { env: { CI: "false" }, columns: 0 });
  const clean = stripAnsi(output).replaceAll("\r", "");
  expect(clean).toContain("Counter:");
  expect(clean).toContain("Counter: 5");
  expect(clean).toContain("#1");
});
