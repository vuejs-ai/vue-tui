import { basename } from "node:path";
import { expect, test } from "vite-plus/test";
import { launchViteChild, screenShowsFrame } from "./child.ts";
import { withViteChild } from "./e2e.ts";
import { createScratchFixture, type ScratchFixture } from "./scratch.ts";

function instrumentEnvironment(scratch: ScratchFixture): void {
  scratch.edit("vite.config.ts", (source) => {
    return `
import { emitTestEvent } from "@vue-tui/runtime/internal/testing";
emitTestEvent("fixture:config-loaded", {
  ci: Object.hasOwn(process.env, "CI") ? process.env.CI : null,
  forceColor: process.env.FORCE_COLOR,
  custom: process.env.CUSTOM_HARNESS_ENV ?? null,
  hasNodeOptions: Object.hasOwn(process.env, "NODE_OPTIONS"),
  hasVitest: Object.keys(process.env).some((key) => key.startsWith("VITEST")),
  argv1: process.argv[1],
});
${source}`;
  });
}

test("launches the real Vite CLI with events, a parsed screen, resize, and controlled env", async () => {
  const scratch = createScratchFixture("basic");
  instrumentEnvironment(scratch);
  await withViteChild(
    scratch,
    async (child) => {
      const configEvent = await child.expectEvent("fixture:config-loaded");
      expect(configEvent.data).toMatchObject({
        ci: "true",
        forceColor: "3",
        custom: "kept",
        hasNodeOptions: false,
        hasVitest: false,
      });
      expect(basename((configEvent.data as { argv1: string }).argv1)).toBe("vite.js");

      await child.expectEvent("terminal:acquired");
      await expect(child.expectScreen((screen) => screen.includes("LABEL-A"))).resolves.toContain(
        "count=",
      );
      expect(await child.screen()).toContain("LABEL-A");
      expect(child.output()).toContain("\x1b[");

      const beforeResize = child.events.length;
      await child.resize(42, 9);
      await child.expectEvent("paint:committed", { after: beforeResize });
      await expect(child.expectScreen((screen) => screen.includes("LABEL-A"))).resolves.toContain(
        "LABEL-A",
      );
      child.write("x");
      await child.quiesce(20, {
        ignore: (event) => event.ev === "paint:committed",
      });
    },
    {
      columns: 80,
      rows: 24,
      env: { CUSTOM_HARNESS_ENV: "kept" },
    },
  );
});

test("omits CI entirely for the explicit interactive scenario", async () => {
  const scratch = createScratchFixture("basic");
  instrumentEnvironment(scratch);
  await withViteChild(
    scratch,
    async (child) => {
      await expect(child.expectEvent("fixture:config-loaded")).resolves.toMatchObject({
        data: { ci: null },
      });
    },
    { ci: false },
  );
});

test("waits for raw PTY output and diagnoses an offset with no matching output", async () => {
  const scratch = createScratchFixture("basic");
  await withViteChild(scratch, async (child) => {
    await child.expectOutput("LABEL-A");

    const after = child.output().length;
    await expect(
      child.expectOutput("HARNESS-OUTPUT-THAT-NEVER-APPEARS", {
        after,
        timeoutMs: 20,
      }),
    ).rejects.toThrow(/Timed out.*waiting for PTY output.*after offset/);
  });
});

test.each(["FORCE_COLOR", "NO_COLOR", "NODE_NO_WARNINGS"])(
  "rejects protected child environment override %s before launch",
  async (name) => {
    const scratch = createScratchFixture("basic");
    try {
      await expect(launchViteChild(scratch.root, { env: { [name]: "1" } })).rejects.toThrow(
        new RegExp(`reserved.*${name}`, "i"),
      );
    } finally {
      scratch.cleanup();
    }
  },
);

test("exposes raw exit information and disposes idempotently", async () => {
  const scratch = createScratchFixture("basic");
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("terminal:acquired");
    child.allowUncleanExit("this test deliberately terminates the child before disposal");
    child.kill(process.platform === "win32" ? undefined : "SIGTERM");
    await expect(child.exited).resolves.toMatchObject({
      exitCode: expect.any(Number),
    });
    child.kill(process.platform === "win32" ? undefined : "SIGTERM");
    await child.dispose();
    await child.dispose();
  });
});

// The false green this closes: every assertion in a test passes, the child then
// dies, and nothing looks at the channel again. Disposal is the last chance to
// notice — and reading `channel.failure` there was not enough, because a process
// killed microseconds earlier still has its socket close queued. Ten runs of this
// shape passed against that version.
const KILL_SIGNAL = process.platform === "win32" ? undefined : "SIGKILL";

test("disposal reports a child that died before it was asked to stop", async () => {
  const scratch = createScratchFixture("basic");
  try {
    const child = await launchViteChild(scratch.root);
    await child.expectEvent("app:mounted");
    // Killed and disposed in the same tick, leaving no room for the harness to
    // notice on its own and no chance for the child to end its protocol.
    child.kill(KILL_SIGNAL);
    await expect(child.dispose()).rejects.toThrow(/Event channel/);
  } finally {
    scratch.cleanup();
  }
});

test("a child declared as exiting uncleanly disposes without complaint", async () => {
  const scratch = createScratchFixture("basic");
  try {
    const child = await launchViteChild(scratch.root);
    await child.expectEvent("app:mounted");
    child.allowUncleanExit("the test kills this child on purpose");
    child.kill(KILL_SIGNAL);
    await expect(child.dispose()).resolves.toBeUndefined();
  } finally {
    scratch.cleanup();
  }
});

// What every end-to-end frame assertion rests on. `expectFrame` reads the frame
// the runtime REPORTED, which says what it meant to write; this is the half that
// says the terminal actually shows it.
test.for([
  ["every painted line is on screen", ["a", "b"], ["log line", "a", "b"], 24, true],
  ["a painted line is missing", ["a", "b"], ["log line", "a"], 24, false],
  ["interior blank lines are preserved", ["a", "", "b"], ["a", "", "b"], 24, true],
  ["a missing interior blank line fails", ["a", "", "b"], ["a", "b"], 24, false],
  ["trailing spaces do not count", ["a  ", "b"], ["a", "b"], 24, true],
  ["line order is preserved", ["a", "b"], ["b", "a"], 24, false],
  ["duplicate lines keep their multiplicity", ["a", "a"], ["a"], 24, false],
  ["log lines cannot split an application frame", ["a", "b"], ["a", "log", "b"], 24, false],
  [
    "an old inline frame cannot hide corrupted current output",
    ["a", "b"],
    ["a", "b", "CORRUPTED-CURRENT-OUTPUT"],
    24,
    false,
  ],
  ["an empty reported frame cannot hide visible output", [""], ["STALE"], 24, false],
  ["an empty reported frame matches an empty viewport", [""], [""], 24, true],
  ["leading spaces remain layout", ["  a", "b"], ["a", "b"], 24, false],
  // A flow-mode frame taller than the terminal has scrolled: only the part that
  // still fits can be required, or the assertion would be unsatisfiable.
  ["only the last rows are required", ["a", "b", "c"], ["b", "c"], 2, true],
  ["a missing line within the last rows still fails", ["a", "b", "c"], ["a", "c"], 2, false],
] as const)("screenShowsFrame: %s", ([, frame, screen, rows, expected]) => {
  expect(screenShowsFrame(frame.join("\n"), screen.join("\n"), rows)).toBe(expected);
});
