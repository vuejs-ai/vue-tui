import { expect, test } from "vite-plus/test";
import { createScratchFixture } from "./harness/scratch.ts";
import { withViteChild } from "./harness/e2e.ts";

const DIAGNOSTIC = "ONE-WRITER-DIAGNOSTIC";

interface BasicFrame {
  readonly count: number;
}

function completeBasicFrameAt(lines: readonly string[], startLine: number): BasicFrame | undefined {
  const top = /^([ ]*)╭(─+)╮$/u.exec(lines[startLine] ?? "");
  if (top === null) return;

  const prefix = top[1]!;
  const label = (lines[startLine + 1] ?? "").slice(prefix.length);
  const countLine = (lines[startLine + 2] ?? "").slice(prefix.length);
  const bottom = (lines[startLine + 3] ?? "").slice(prefix.length);
  const count = /^│count=(\d+) *│$/u.exec(countLine);
  if (!/^│LABEL-A *│$/u.test(label) || count === null || bottom !== `╰${top[2]}╯`) {
    return;
  }

  const width = Array.from(lines[startLine]!).length;
  if (
    [lines[startLine + 1], lines[startLine + 2], lines[startLine + 3]].some(
      (line) => line === undefined || Array.from(line).length !== width,
    )
  ) {
    return;
  }

  return { count: Number(count[1]) };
}

function diagnosticFollowedByFrame(screen: string): BasicFrame | undefined {
  const lines = screen.split("\n");
  const diagnosticLine = lines.lastIndexOf(DIAGNOSTIC);
  if (diagnosticLine === -1) return;
  return completeBasicFrameAt(lines, diagnosticLine + 1);
}

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

test("a Vite diagnostic and the live frame share one terminal writer", async () => {
  const scratch = createScratchFixture("basic");
  scratch.write("diagnostic-trigger.txt", "before\n");
  scratch.write(
    "vite.config.ts",
    `import { resolve } from "node:path";
import { defineConfig } from "vite";
import vue from "unplugin-vue/vite";
import { emitTestEvent } from "@vue-tui/runtime/internal/testing";
import { vueTui } from "@vue-tui/vite";

const diagnosticFile = resolve(process.cwd(), "diagnostic-trigger.txt");

const diagnosticPlugin = {
  name: "test:one-writer-diagnostic",
  hotUpdate: {
    handler(options) {
      if (options.file !== diagnosticFile) return;
      if (this.environment.name === "ssr") {
        options.server.config.logger.error(${JSON.stringify(DIAGNOSTIC)});
        emitTestEvent("fixture:diagnostic-written");
      }
      return [];
    },
  },
};

export default defineConfig({
  plugins: [vue(), diagnosticPlugin, vueTui()],
});
`,
  );

  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    const initialScreen = await child.expectScreen((screen) => {
      const lines = screen.split("\n");
      return lines.some((_, index) => (completeBasicFrameAt(lines, index)?.count ?? -1) >= 3);
    });
    const initialLines = initialScreen.split("\n");
    const initialFrame = initialLines
      .map((_, index) => completeBasicFrameAt(initialLines, index))
      .find((frame) => frame !== undefined && frame.count >= 3)!;

    const eventCursor = child.events.length;
    const outputCursor = child.output().length;
    scratch.write("diagnostic-trigger.txt", "after\n");

    const diagnosticEvent = await child.expectEvent("fixture:diagnostic-written", {
      after: eventCursor,
    });
    const diagnosticCursor = child.events.indexOf(diagnosticEvent) + 1;
    const settledScreen = await child.expectScreen(
      (screen) => {
        const frame = diagnosticFollowedByFrame(screen);
        return frame !== undefined && frame.count > initialFrame.count;
      },
      { after: diagnosticCursor, timeoutMs: 5_000 },
    );
    const settledFrame = diagnosticFollowedByFrame(settledScreen)!;

    expect(settledFrame.count).toBeGreaterThan(initialFrame.count);
    expect(occurrences(child.output().slice(outputCursor), DIAGNOSTIC)).toBe(1);

    await child.quiesce(150, {
      ignore: (event) => event.ev === "paint:committed",
    });
    const eventsAfterDiagnostic = child.events.slice(eventCursor).map(({ ev }) => ev);
    for (const forbidden of [
      "hmr:update-received",
      "hmr:error",
      "app:unmounted",
      "terminal:released",
    ]) {
      expect(eventsAfterDiagnostic).not.toContain(forbidden);
    }
  });
});
