import headless from "@xterm/headless";
import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

const { Terminal } = headless;
const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const ENABLE_BRACKETED_PASTE = "\x1b[?2004h";
const DISABLE_BRACKETED_PASTE = "\x1b[?2004l";
const QUERY_KITTY_KEYBOARD = "\x1b[?u";
const ENABLE_KITTY_KEYBOARD = "\x1b[>1u";
const DISABLE_KITTY_KEYBOARD = "\x1b[<u";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const PASTE = "\x1b[200~terminal-paste\x1b[201~";
const expectedTrace = [
  "global:x",
  "target:first:x",
  "scope:background:x",
  "external:first:x",
  "global:Tab",
  "target:first:Tab",
  "scope:background:Tab",
  "global:r",
  "target:second:r",
  "scope:background:r",
  "external:second:r",
  "global:o",
  "target:first:o",
  "scope:background:o",
  "external:first:o",
  "global:m",
  "scope:modal:m",
  "target:modal:m",
  "external:modal:m",
  "global:c",
  "scope:modal:c",
  "global:Paste:terminal-paste",
  "target:first:Paste:terminal-paste",
  "scope:background:Paste:terminal-paste",
  "external:first:Paste:terminal-paste",
  "global:q",
] as const;

function occurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

async function emulate(output: string): Promise<InstanceType<typeof Terminal>> {
  const terminal = new Terminal({ cols: 100, rows: 24, allowProposedApi: true });
  await new Promise<void>((resolve) => terminal.write(output, resolve));
  return terminal;
}

function allBufferLines(terminal: InstanceType<typeof Terminal>): string[] {
  const buffer = terminal.buffer.active;
  return Array.from({ length: buffer.length }, (_, row) =>
    (buffer.getLine(row)?.translateToString(true) ?? "").trimEnd(),
  );
}

function expectExactCleanup(output: string, mode: "inline" | "fullscreen"): void {
  const completion = output.indexOf("__FOCUS_ROUTING_OK__");
  expect(completion).toBeGreaterThan(-1);

  expect(occurrences(output, ENABLE_BRACKETED_PASTE)).toBe(1);
  expect(occurrences(output, DISABLE_BRACKETED_PASTE)).toBe(1);
  expect(output.lastIndexOf(DISABLE_BRACKETED_PASTE)).toBeGreaterThan(
    output.lastIndexOf(ENABLE_BRACKETED_PASTE),
  );
  expect(output.lastIndexOf(DISABLE_BRACKETED_PASTE)).toBeLessThan(completion);

  expect(occurrences(output, QUERY_KITTY_KEYBOARD)).toBe(1);
  expect(occurrences(output, ENABLE_KITTY_KEYBOARD)).toBe(1);
  expect(occurrences(output, DISABLE_KITTY_KEYBOARD)).toBe(1);
  expect(output.lastIndexOf(DISABLE_KITTY_KEYBOARD)).toBeGreaterThan(
    output.lastIndexOf(ENABLE_KITTY_KEYBOARD),
  );
  expect(output.lastIndexOf(DISABLE_KITTY_KEYBOARD)).toBeLessThan(completion);

  expect(output).toContain(HIDE_CURSOR);
  expect(output.lastIndexOf(SHOW_CURSOR)).toBeGreaterThan(output.lastIndexOf(HIDE_CURSOR));
  expect(output.lastIndexOf(SHOW_CURSOR)).toBeLessThan(completion);
  expect(output).not.toContain("\x1b[?1000h");
  expect(output).not.toContain("\x1b[?1002h");
  expect(output).not.toContain("\x1b[?1003h");

  if (mode === "fullscreen") {
    expect(occurrences(output, ENTER_ALT_SCREEN)).toBe(1);
    expect(occurrences(output, EXIT_ALT_SCREEN)).toBe(1);
    expect(output.lastIndexOf(EXIT_ALT_SCREEN)).toBeGreaterThan(
      output.lastIndexOf(ENTER_ALT_SCREEN),
    );
    expect(output.lastIndexOf(EXIT_ALT_SCREEN)).toBeLessThan(completion);
  } else {
    expect(output).not.toContain(ENTER_ALT_SCREEN);
    expect(output).not.toContain(EXIT_ALT_SCREEN);
  }
}

test.each(["inline", "fullscreen"] as const)(
  "public focus lifecycle restores a real %s terminal exactly",
  async (mode) => {
    const ps = term("focus-routing", [mode, "assert"], { name: "xterm-256color" });
    try {
      // The lightweight PTY helper is not itself a terminal emulator, so answer
      // the owned query as soon as it appears, exactly as xterm's emulator does
      // in visual review. Waiting for a later focus render first can exceed the
      // protocol's bounded reply window under a contended CI worker.
      await ps.waitForOutput((output) => output.includes(QUERY_KITTY_KEYBOARD));
      ps.write("\x1b[?1u");
      await ps.waitForOutput((output) => output.includes(ENABLE_KITTY_KEYBOARD));
      await ps.waitForOutput(
        (output) =>
          output.includes("__READY__") &&
          output.includes(`F4 focus lifecycle (${mode})`) &&
          output.includes("focus=first second=present modal=closed"),
      );

      let before = ps.output.length;
      ps.write("x");
      await ps.waitForOutput((output) =>
        output.slice(before).includes("latest=x route=global > first > background > ext:first"),
      );

      before = ps.output.length;
      ps.write("\t");
      await ps.waitForOutput(
        (output) =>
          output.slice(before).includes("focus=second second=present modal=closed") &&
          output.slice(before).includes("latest=Tab route=global > first > background"),
      );

      // The focused second host is removed by v-if. The next committed frame
      // must select the first rendered fallback, while the removal fact itself
      // finishes on the captured second-target route.
      before = ps.output.length;
      ps.write("r");
      await ps.waitForOutput(
        (output) =>
          output.slice(before).includes("focus=first second=removed modal=closed") &&
          output.slice(before).includes("latest=r route=global > second > background > ext:second"),
      );

      before = ps.output.length;
      ps.write("o");
      await ps.waitForOutput(
        (output) =>
          output.slice(before).includes("focus=modal second=removed modal=open") &&
          output.slice(before).includes("Approval modal (trapped)"),
      );

      // The open trap captures the route. Its own explicit external owner may
      // receive the fact, while all background recipients remain isolated.
      before = ps.output.length;
      ps.write("m");
      await ps.waitForOutput((output) =>
        output.slice(before).includes("latest=m route=global > trap > modal > ext:modal"),
      );

      // c is consumed by the trapped boundary, then Vue unmounts the entire
      // modal component and its focus scope. The following frame proves exact
      // restoration of the surviving first target.
      before = ps.output.length;
      ps.write("c");
      await ps.waitForOutput(
        (output) =>
          output.slice(before).includes("focus=first second=removed modal=closed") &&
          output.slice(before).includes("latest=c route=global > trap"),
      );

      before = ps.output.length;
      ps.write(PASTE);
      await ps.waitForOutput((output) =>
        output.slice(before).includes("latest=Paste route=global > first > background > ext:first"),
      );

      ps.write("q");
      await ps.waitForOutput((output) => output.includes("__FOCUS_ROUTING_OK__"));
      await ps.waitForExit();

      expect(ps.output).toContain(`__TRACE__${JSON.stringify(expectedTrace)}__`);
      expectExactCleanup(ps.output, mode);

      const terminal = await emulate(ps.output);
      expect(terminal.buffer.active.type).toBe("normal");
      expect(terminal.modes.bracketedPasteMode).toBe(false);
      expect(terminal.modes.applicationCursorKeysMode).toBe(false);
      expect(terminal.modes.sendFocusMode).toBe(false);
      expect(terminal.modes.mouseTrackingMode).toBe("none");
      const restoredText = allBufferLines(terminal).join("\n");
      expect(restoredText).toContain("__FOCUS_ROUTING_OK__");
      if (mode === "fullscreen") {
        expect(restoredText).not.toContain("F4 focus lifecycle");
        expect(restoredText).not.toContain("Approval modal (trapped)");
      } else {
        expect(restoredText).toContain("F4 focus lifecycle (inline)");
        expect(restoredText).toContain("latest=q route=global");
      }
    } finally {
      ps.killNow("SIGKILL");
    }
  },
);
