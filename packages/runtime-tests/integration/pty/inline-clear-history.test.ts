import headless from "@xterm/headless";
import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

const { Terminal } = headless;

test("repeated app.clear keeps pre-app history outside writer ownership", async () => {
  const ps = term("inline-clear-history", ["4"]);
  await ps.waitForExit();

  for (const reset of ["\x1b[2J", "\x1b[3J", "\x1b[H"]) {
    expect(ps.output).not.toContain(reset);
  }

  const terminal = new Terminal({
    cols: 100,
    rows: 4,
    scrollback: 1000,
    allowProposedApi: true,
  });
  await new Promise<void>((resolve) => terminal.write(ps.output, resolve));
  const buffer = terminal.buffer.normal;
  const lines = Array.from({ length: buffer.length }, (_, row) =>
    (buffer.getLine(row)?.translateToString(true) ?? "").trimEnd(),
  );

  expect(lines).toContain("PRE_APP_HISTORY");
  expect(lines.filter((line) => line === "COMMITTED")).toHaveLength(1);
  expect(lines).toContain("LIVE 2");
  expect(lines).toContain("POST_APP");
  expect(lines.indexOf("POST_APP")).toBeGreaterThan(lines.indexOf("LIVE 2"));
});
