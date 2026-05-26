import { test as it, expect } from "vite-plus/test";
import { run } from "./helpers/run.ts";

it("console.log doesn't corrupt output", async () => {
  const output = await run("console");
  expect(output).toContain("First log");
  expect(output).toContain("Second log");
});

it("useStdout.write in real terminal", async () => {
  const output = await run("use-stdout");
  expect(output).toContain("Hello from vue-tui to stdout");
  expect(output).toContain("exited");
});
