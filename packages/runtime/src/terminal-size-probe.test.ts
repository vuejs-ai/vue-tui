import { describe, expect, test, vi } from "vite-plus/test";
import {
  probeControllingTerminalSize,
  type TerminalSizeProbeDependencies,
} from "./terminal-size-probe.ts";

function createDependencies(
  overrides: Partial<TerminalSizeProbeDependencies> = {},
): TerminalSizeProbeDependencies {
  return {
    platform: "linux",
    stdout: undefined,
    stderr: undefined,
    env: {},
    readControllingTtySize: () => undefined,
    runCommand: () => "",
    isForegroundProcess: () => true,
    ...overrides,
  };
}

describe("probeControllingTerminalSize", () => {
  test("returns the first positive pair in terminal-size@4 source order", () => {
    const controllingTty = vi.fn(() => ({ columns: 130, rows: 50 }));
    const runCommand = vi.fn(() => "140");

    expect(
      probeControllingTerminalSize(
        createDependencies({
          stdout: { columns: 100, rows: 30 },
          stderr: { columns: 110, rows: 40 },
          env: { COLUMNS: "120", LINES: "45" },
          readControllingTtySize: controllingTty,
          runCommand,
        }),
      ),
    ).toEqual({
      kind: "detected",
      size: { columns: 100, rows: 30 },
      source: "process-stdout",
    });
    expect(controllingTty).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });

  test("falls through stderr, environment, controlling tty, tput, and Linux resize", () => {
    const cases: Array<{
      dependencies: TerminalSizeProbeDependencies;
      expected: unknown;
    }> = [
      {
        dependencies: createDependencies({ stderr: { columns: 101, rows: 31 } }),
        expected: {
          kind: "detected",
          size: { columns: 101, rows: 31 },
          source: "process-stderr",
        },
      },
      {
        dependencies: createDependencies({ env: { COLUMNS: "102", LINES: "32" } }),
        expected: {
          kind: "detected",
          size: { columns: 102, rows: 32 },
          source: "environment",
        },
      },
      {
        dependencies: createDependencies({
          readControllingTtySize: () => ({ columns: 103, rows: 33 }),
        }),
        expected: {
          kind: "detected",
          size: { columns: 103, rows: 33 },
          source: "controlling-tty",
        },
      },
      {
        dependencies: createDependencies({
          runCommand: (command) => ({ tput: "104", resize: "" })[command] ?? "",
        }),
        expected: {
          kind: "detected",
          size: { columns: 104, rows: 104 },
          source: "tput",
        },
      },
      {
        dependencies: createDependencies({
          runCommand: (command, arguments_) =>
            command === "resize" && arguments_[0] === "-u"
              ? "COLUMNS=105; LINES=35; export COLUMNS LINES;"
              : "",
        }),
        expected: {
          kind: "detected",
          size: { columns: 105, rows: 35 },
          source: "resize",
        },
      },
    ];

    for (const { dependencies, expected } of cases) {
      expect(probeControllingTerminalSize(dependencies)).toEqual(expected);
    }
  });

  test("asks tput separately for columns and rows with the supplied environment", () => {
    const runCommand = vi.fn((command: string, arguments_: readonly string[]) => {
      if (command !== "tput") return "";
      return arguments_[0] === "cols" ? "121\n" : "41\n";
    });

    expect(
      probeControllingTerminalSize(
        createDependencies({
          env: { TERM: "xterm-256color", CUSTOM: "yes" },
          runCommand,
        }),
      ),
    ).toEqual({
      kind: "detected",
      size: { columns: 121, rows: 41 },
      source: "tput",
    });
    expect(runCommand).toHaveBeenNthCalledWith(1, "tput", ["cols"], {
      env: { TERM: "xterm-256color", CUSTOM: "yes" },
    });
    expect(runCommand).toHaveBeenNthCalledWith(2, "tput", ["lines"], {
      env: { TERM: "xterm-256color", CUSTOM: "yes" },
    });
  });

  test("rejects incomplete, non-positive, and non-numeric pairs at every source", () => {
    const runCommand = vi.fn((command: string, arguments_: readonly string[]) => {
      if (command === "tput") return arguments_[0] === "cols" ? "0" : "24";
      return "COLUMNS=-1; LINES=40; export COLUMNS LINES;";
    });

    expect(
      probeControllingTerminalSize(
        createDependencies({
          stdout: { columns: 90, rows: 0 },
          stderr: { columns: Number.NaN, rows: 20 },
          env: { COLUMNS: "wide", LINES: "30" },
          readControllingTtySize: () => ({ columns: -100, rows: 40 }),
          runCommand,
        }),
      ),
    ).toEqual({ kind: "unavailable" });
  });

  test.each(["120px", "12.5", "1e2", "-12", "", 12.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects a non-exact positive integer dimension: %j",
    (columns) => {
      expect(
        probeControllingTerminalSize(
          createDependencies({
            stdout: { columns, rows: 30 },
          }),
        ),
      ).toEqual({ kind: "unavailable" });
    },
  );

  test("does not report terminal-size@4's ambiguous 80x24 tput or resize defaults", () => {
    const tputCommands = createDependencies({
      platform: "darwin",
      runCommand: (_command, arguments_) => (arguments_[0] === "cols" ? "80" : "24"),
    });
    const resizeCommand = createDependencies({
      runCommand: (command, arguments_) => {
        if (command === "tput") return arguments_[0] === "cols" ? "80" : "24";
        return "COLUMNS=80; LINES=24; export COLUMNS LINES;";
      },
    });

    expect(probeControllingTerminalSize(tputCommands)).toEqual({ kind: "unavailable" });
    expect(probeControllingTerminalSize(resizeCommand)).toEqual({ kind: "unavailable" });
  });

  test("uses Linux resize only for a foreground process", () => {
    const backgroundRunCommand = vi.fn((_command: string) => "COLUMNS=150; LINES=60;");
    const nonLinuxRunCommand = vi.fn((_command: string) => "COLUMNS=150; LINES=60;");

    expect(
      probeControllingTerminalSize(
        createDependencies({
          isForegroundProcess: () => false,
          runCommand: backgroundRunCommand,
        }),
      ),
    ).toEqual({ kind: "unavailable" });
    expect(backgroundRunCommand).toHaveBeenCalledTimes(2);
    expect(backgroundRunCommand.mock.calls.map(([command]) => command)).toEqual(["tput", "tput"]);

    expect(
      probeControllingTerminalSize(
        createDependencies({ platform: "freebsd", runCommand: nonLinuxRunCommand }),
      ),
    ).toEqual({ kind: "unavailable" });
    expect(nonLinuxRunCommand).toHaveBeenCalledTimes(2);
    expect(nonLinuxRunCommand.mock.calls.map(([command]) => command)).toEqual(["tput", "tput"]);
  });

  test("skips /dev/tty on Windows but still tries tput for Git Bash", () => {
    const readControllingTtySize = vi.fn(() => ({ columns: 160, rows: 70 }));

    expect(
      probeControllingTerminalSize(
        createDependencies({
          platform: "win32",
          readControllingTtySize,
          runCommand: (_command, arguments_) => (arguments_[0] === "cols" ? "161" : "71"),
        }),
      ),
    ).toEqual({
      kind: "detected",
      size: { columns: 161, rows: 71 },
      source: "tput",
    });
    expect(readControllingTtySize).not.toHaveBeenCalled();
  });

  test("treats source failures as misses and ends at unavailable without a fabricated fallback", () => {
    expect(
      probeControllingTerminalSize(
        createDependencies({
          readControllingTtySize: () => {
            throw new Error("no controlling terminal");
          },
          runCommand: () => {
            throw new Error("command missing");
          },
          isForegroundProcess: () => {
            throw new Error("cannot inspect process group");
          },
        }),
      ),
    ).toEqual({ kind: "unavailable" });
  });
});
