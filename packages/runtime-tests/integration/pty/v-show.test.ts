import headless from "@xterm/headless";
import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

const { Terminal } = headless;
const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const ENABLE_BRACKETED_PASTE = "\x1b[?2004h";
const DISABLE_BRACKETED_PASTE = "\x1b[?2004l";
const SHOW_CURSOR = "\x1b[?25h";

function occurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

async function visibleLines(output: string): Promise<string[]> {
  const terminal = new Terminal({ cols: 100, rows: 24, allowProposedApi: true });
  await new Promise<void>((resolve) => terminal.write(output, resolve));
  const buffer = terminal.buffer.active;
  return Array.from({ length: terminal.rows }, (_, row) =>
    (buffer.getLine(row)?.translateToString(true) ?? "").trimEnd(),
  );
}

function throughMarker(output: string, marker: string): string {
  const index = output.indexOf(marker);
  expect(index).toBeGreaterThanOrEqual(0);
  return output.slice(0, index + marker.length);
}

test("Box-rooted v-show preserves state and terminal ownership through a real Fullscreen PTY", async () => {
  const ps = term("v-show", ["24"], { name: "xterm-256color" });
  let exited = false;

  try {
    const shownMarker = "__VSHOW_PHASE__:shown:mounts=1:unmounts=0";
    await ps.waitForOutput((output) => output.includes(shownMarker));
    let lines = await visibleLines(throughMarker(ps.output, shownMarker));
    expect(lines).toContain("probe:0");
    expect(lines).toContain("visible=true revision=0");

    let before = ps.output.length;
    ps.write("h");
    const hiddenMarker = "__VSHOW_PHASE__:hidden:mounts=1:unmounts=0";
    await ps.waitForOutput((output) => output.slice(before).includes(hiddenMarker));
    const hiddenOutput = throughMarker(ps.output, hiddenMarker);
    lines = await visibleLines(hiddenOutput);
    expect(lines).not.toContain("probe:0");
    expect(lines).toContain("visible=false revision=0");

    before = ps.output.length;
    ps.write("u");
    const updatedMarker = "__VSHOW_PHASE__:updated-hidden:mounts=1:unmounts=0";
    await ps.waitForOutput((output) => output.slice(before).includes(updatedMarker));
    lines = await visibleLines(throughMarker(ps.output, updatedMarker));
    expect(lines).not.toContain("probe:2");
    expect(lines).toContain("visible=false revision=2");

    before = ps.output.length;
    ps.write("s");
    const restoredMarker = "__VSHOW_PHASE__:shown-again:mounts=1:unmounts=0";
    await ps.waitForOutput((output) => output.slice(before).includes(restoredMarker));
    lines = await visibleLines(throughMarker(ps.output, restoredMarker));
    expect(lines).toContain("probe:2");
    expect(lines).toContain("visible=true revision=2");

    ps.write("q");
    await ps.waitForOutput((output) => output.includes("__VSHOW_OK__:mounts=1:unmounts=1"));
    await ps.waitForExit();
    exited = true;

    expect(occurrences(ps.output, ENTER_ALT_SCREEN)).toBe(1);
    expect(occurrences(ps.output, EXIT_ALT_SCREEN)).toBe(1);
    expect(occurrences(ps.output, ENABLE_BRACKETED_PASTE)).toBe(1);
    expect(occurrences(ps.output, DISABLE_BRACKETED_PASTE)).toBe(1);
    expect(ps.output.lastIndexOf(EXIT_ALT_SCREEN)).toBeGreaterThan(
      ps.output.lastIndexOf(ENTER_ALT_SCREEN),
    );
    expect(ps.output.lastIndexOf(SHOW_CURSOR)).toBeLessThan(ps.output.indexOf("__VSHOW_OK__"));
  } finally {
    if (!exited) ps.killNow("SIGTERM");
  }
});
