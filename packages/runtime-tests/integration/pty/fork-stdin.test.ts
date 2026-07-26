import { expect, test } from "vite-plus/test";
import term from "./helpers/term.ts";

const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const ENABLE_BRACKETED_PASTE = "\x1b[?2004h";
const DISABLE_BRACKETED_PASTE = "\x1b[?2004l";
const ENABLE_KITTY_KEYBOARD = "\x1b[>1u";
const DISABLE_KITTY_KEYBOARD = "\x1b[<u";
const ENABLE_SGR_MOUSE = "\x1b[?1006h";
const DISABLE_SGR_MOUSE = "\x1b[?1006l";
const ENABLE_BUTTON_MOUSE = "\x1b[?1000h";
const DISABLE_BUTTON_MOUSE = "\x1b[?1000l";
const ENABLE_DRAG_MOUSE = "\x1b[?1002h";
const DISABLE_DRAG_MOUSE = "\x1b[?1002l";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const ENABLE_SYNC_OUTPUT = "\x1b[?2026h";
const DISABLE_SYNC_OUTPUT = "\x1b[?2026l";

type FixtureKind = "input-free" | "active-input";
type StdinTopology = "ignored" | "piped";

interface ForkResult {
  readonly topology: StdinTopology;
  readonly kind: FixtureKind;
  readonly exitCode: number;
  readonly signal: null;
  readonly streams: {
    readonly stdinIsTTY: boolean;
    readonly stdoutIsTTY: boolean;
    readonly stderrIsTTY: boolean;
  };
  readonly childMessage: {
    readonly kind: FixtureKind;
    readonly status: "rendered" | "rejected";
    readonly streams: {
      readonly stdinIsTTY: boolean;
      readonly stdoutIsTTY: boolean;
      readonly stderrIsTTY: boolean;
    };
    readonly receivedInput: boolean;
    readonly message?: string;
  };
}

const FORK_RESULT_PATTERN = /__FORK_RESULT__(\{[^\r\n]*\})\r?\n/;

const readResult = (output: string): ForkResult => {
  const match = FORK_RESULT_PATTERN.exec(output);
  expect(match, `Missing fork result in:\n${output}`).not.toBeNull();
  return JSON.parse(match![1]!) as ForkResult;
};

const countOccurrences = (output: string, sequence: string): number =>
  output.split(sequence).length - 1;

const expectBalancedOwnership = (output: string, acquire: string, release: string): void => {
  const acquisitions = countOccurrences(output, acquire);
  expect(countOccurrences(output, release)).toBe(acquisitions);
  if (acquisitions === 0) return;
  expect(output.lastIndexOf(release)).toBeGreaterThan(output.lastIndexOf(acquire));
};

test.each([
  ["ignored", "input-free"],
  ["ignored", "active-input"],
  ["piped", "input-free"],
  ["piped", "active-input"],
] as const)(
  "#266: a fork with %s stdin keeps %s behavior inside vue-tui's host contract",
  async (topology, kind) => {
    const process = term("fork-stdin", [topology, kind]);
    await process.waitForOutput((output) => FORK_RESULT_PATTERN.test(output));
    await process.waitForExit();

    const result = readResult(process.output);
    expect(result).toMatchObject({
      topology,
      kind,
      exitCode: 0,
      signal: null,
      streams: {
        stdinIsTTY: true,
        stdoutIsTTY: true,
        stderrIsTTY: true,
      },
      childMessage: {
        kind,
        receivedInput: topology === "piped" && kind === "active-input",
        streams: {
          stdinIsTTY: false,
          stdoutIsTTY: true,
          stderrIsTTY: true,
        },
      },
    });

    for (const sequence of [
      ENTER_ALT_SCREEN,
      EXIT_ALT_SCREEN,
      ENABLE_BRACKETED_PASTE,
      DISABLE_BRACKETED_PASTE,
      ENABLE_KITTY_KEYBOARD,
      DISABLE_KITTY_KEYBOARD,
      ENABLE_SGR_MOUSE,
      DISABLE_SGR_MOUSE,
      ENABLE_BUTTON_MOUSE,
      DISABLE_BUTTON_MOUSE,
      ENABLE_DRAG_MOUSE,
      DISABLE_DRAG_MOUSE,
    ]) {
      expect(process.output).not.toContain(sequence);
    }

    expectBalancedOwnership(process.output, HIDE_CURSOR, SHOW_CURSOR);
    expectBalancedOwnership(process.output, ENABLE_SYNC_OUTPUT, DISABLE_SYNC_OUTPUT);

    expect(result.childMessage.status).toBe("rendered");
    expect(process.output).toContain(
      kind === "input-free" ? "__FORK_OUTPUT_OK__" : "__ACTIVE_INPUT__",
    );
  },
);
