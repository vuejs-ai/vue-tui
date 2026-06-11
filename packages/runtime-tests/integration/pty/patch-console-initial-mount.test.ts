import { test as it, expect } from "vite-plus/test";
import stripAnsi from "strip-ansi";
import { run } from "./helpers/run.ts";

// The console patch must be installed BEFORE the first Vue mount (Ink patches
// in its constructor, ink.tsx:435-436, before the first React render). A root
// whose setup() throws makes Vue emit its dev-only "[Vue warn]: Component is
// missing template or render function." DURING the initial mount — with the
// patch installed only after mount, that warn escaped to the real terminal
// even with patchConsole on.
it("filters a [Vue warn] emitted during the initial mount (patchConsole default)", async () => {
  const output = await run("patch-console-initial-mount");

  // waitUntilExit() still rejects with the setup error.
  expect(output).toContain("waitUntilExit:rejected:setup boom");

  const plain = stripAnsi(output);

  // The error overview still renders (" ERROR  <message>" after ANSI strip).
  expect(plain).toContain(" ERROR ");
  expect(plain).toContain("setup boom");

  // No [Vue warn] line reaches the terminal.
  const vueWarnLines = plain.split(/\r?\n/).filter((line) => line.startsWith("[Vue warn]"));
  expect(vueWarnLines).toEqual([]);
});
