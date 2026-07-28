import { test as it, expect } from "vite-plus/test";
import stripAnsi from "strip-ansi";
import { run } from "./helpers/run.ts";

it("forwards a [Vue warn] emitted during the initial mount (patchConsole default)", async () => {
  const output = await run("patch-console-initial-mount");

  expect(output).toContain("waitUntilExit:resolved");

  const plain = stripAnsi(output);
  const vueWarnLines = plain.split(/\r?\n/).filter((line) => line.startsWith("[Vue warn]"));
  expect(vueWarnLines).toHaveLength(1);
  expect(vueWarnLines[0]).toContain('injection "intentionally-missing-injection" not found');
  expect(plain).toContain("mounted after warning");
});
