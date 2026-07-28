import { expect, test } from "vite-plus/test";
import { type ViteChild } from "./harness/child.ts";
import { createScratchFixture, type ScratchFixture } from "./harness/scratch.ts";
import { replayScreenFrames } from "./harness/screen.ts";
import {
  eventKind,
  hasCountAtLeast,
  latestCount,
  settleViteWatchChange,
  withViteChild,
} from "./harness/e2e.ts";

/** Every counter on the screen. The frame-history assertions below need all of them. */
function countsFromScreen(screen: string): number[] {
  return [...screen.matchAll(/count=(\d+)/g)].map((match) => Number(match[1]));
}

function withoutConsecutiveDuplicates(values: readonly number[]): number[] {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

function expectFreshFrames(frames: readonly string[]): void {
  const freshStart = frames.findIndex((frame) => latestCount(frame) === 0);
  expect(freshStart).not.toBe(-1);
  const countFrames = frames
    .slice(freshStart)
    .map(countsFromScreen)
    .filter((counts) => counts.length > 0);
  const stableHistory = countFrames[0].slice(0, -1);
  for (const [index, frameCounts] of countFrames.entries()) {
    expect(frameCounts.slice(0, -1), `historical counters changed in frame ${index}`).toEqual(
      stableHistory,
    );
  }
  const currentCounts = withoutConsecutiveDuplicates(countFrames.map((counts) => counts.at(-1)!));
  expect(currentCounts.slice(0, 4)).toEqual([0, 1, 2, 3]);
  for (let index = 1; index < currentCounts.length; index++) {
    expect(currentCounts[index]).toBe(currentCounts[index - 1] + 1);
  }
}

async function expectBoot(child: ViteChild): Promise<void> {
  await child.expectEvent("app:mounted");
  await child.expectEvent("app:setup-ran");
  await expect(
    child.expectScreen((screen) => screen.includes("LABEL-A") && hasCountAtLeast(screen, 3)),
  ).resolves.toContain("LABEL-A");
}

async function expectCleanReload(
  child: ViteChild,
  scratch: ScratchFixture,
  nextMain: string,
): Promise<void> {
  const after = child.events.length;
  const outputAfter = child.output().length;
  scratch.write("src/main.ts", nextMain);

  await expect(
    child.expectEvent("hmr:update-received", {
      after,
      predicate: (event) => eventKind(event) === "full-reload",
    }),
  ).resolves.toMatchObject({ data: { kind: "full-reload" } });
  await child.expectEvent("app:unmounted", { after });
  await child.expectEvent("terminal:released", { after });
  await child.expectEvent("terminal:acquired", { after });
  await child.expectEvent("app:setup-ran", { after });
  await child.expectEvent("app:mounted", { after });
  const afterMounted = child.events.length;
  await expect(
    child.expectScreen((screen) => screen.includes("LABEL-A") && hasCountAtLeast(screen, 3), {
      after: afterMounted,
    }),
  ).resolves.toContain("LABEL-A");

  const frames = await replayScreenFrames(child.output(), 80, 24);
  expectFreshFrames(
    frames.filter((frame) => frame.endOffset > outputAfter).map((frame) => frame.text),
  );
}

test("entry-level changes restart the app twice with fresh state and no zombie renderer", async () => {
  const scratch = createScratchFixture("reload");
  const originalMain = scratch.read("src/main.ts");
  await withViteChild(scratch, async (child) => {
    await expectBoot(child);

    await expectCleanReload(child, scratch, `${originalMain}\n// reload-marker-1\n`);
    await expectCleanReload(child, scratch, `${originalMain}\n// reload-marker-2\n`);
  });
});

test("a second full reload survives the published path with Runtime externalized", async () => {
  const scratch = createScratchFixture("reload");
  const originalMain = scratch.read("src/main.ts");
  scratch.write(
    "vite.config.ts",
    `
import { defineConfig } from "vite";
import vue from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

export default defineConfig({
  plugins: [vue(), vueTui()],
  ssr: {
    external: ["@vue-tui/runtime", "@vue-tui/runtime/internal/devtools"],
  },
});
`,
  );
  await withViteChild(scratch, async (child) => {
    await expectBoot(child);

    await expectCleanReload(child, scratch, `${originalMain}\n// external-reload-marker-1\n`);
    await expectCleanReload(child, scratch, `${originalMain}\n// external-reload-marker-2\n`);
  });
});

// The other rows here reload from a healthy state, so nothing covered the one
// thing that can actually cross the cycle: dev status. Deleting the single
// `resetDevState()` call in render.ts turned no test red while leaving a freshly
// booted app painting the previous run's error panel.
test("a full reload after a build error starts clean instead of inheriting it", async () => {
  const scratch = createScratchFixture("reload");
  const originalMain = scratch.read("src/main.ts");
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await expect(child.expectScreen((screen) => screen.includes("LABEL-A"))).resolves.toContain(
      "LABEL-A",
    );

    const breakAfter = child.events.length;
    scratch.write("src/main.ts", `${originalMain}\nconst broken = (;\n`);
    await child.expectEvent("hmr:error", { after: breakAfter });
    await settleViteWatchChange(child);

    // Inline keeps everything it printed, so the error text stays in scrollback
    // forever and a whole-screen assertion could never see it leave. The claim is
    // about what the FRESH app paints, which is exactly one frame.
    const fixAfter = child.events.length;
    scratch.write("src/main.ts", `${originalMain}\n// recovered\n`);
    await child.expectEvent("app:mounted", { after: fixAfter });
    await child.expectFrame((frame) => frame.includes("LABEL-A"), { after: fixAfter });
    await child.quiesce(250, { ignore: (event) => event.ev === "paint:committed" });
    expect(child.frame()).not.toContain("Build Error");
  });
});
