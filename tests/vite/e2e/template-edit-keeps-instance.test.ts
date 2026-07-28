import { expect, test } from "vite-plus/test";
import { createScratchFixture } from "./harness/scratch.ts";
import { hasCountAtLeast, latestCount, withViteChild } from "./harness/e2e.ts";

function firstCountAfterLabel(output: string, label: string): number | undefined {
  const labelOffset = output.indexOf(label);
  if (labelOffset === -1) return undefined;
  return latestCount(output.slice(labelOffset));
}

test("boots legal SFC text that resembles a compiler helper", async () => {
  const scratch = createScratchFixture("basic");
  scratch.edit("src/app.vue", (source) => source.replace("LABEL-A", "_sfc_ssrRender"));
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("terminal:acquired");
    await child.expectEvent("app:mounted");
    await expect(
      child.expectScreen(
        (screen) => screen.includes("_sfc_ssrRender") && latestCount(screen) !== undefined,
      ),
    ).resolves.toContain("_sfc_ssrRender");
  });
});

test("a template-only edit preserves component state without remounting or rerunning setup", async () => {
  const scratch = createScratchFixture("basic");
  const originalApp = scratch.read("src/app.vue");
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await child.expectEvent("app:setup-ran");
    const beforeScreen = await child.expectScreen((screen) => hasCountAtLeast(screen, 3));
    const beforeCount = latestCount(beforeScreen)!;

    const after = child.events.length;
    const outputAfter = child.output().length;
    scratch.write("src/app.vue", originalApp.replace("LABEL-A", "LABEL-B-HOT"));
    await child.expectEvent("hmr:update-received", { after });
    await child.expectEvent("hmr:update-applied", { after });
    const afterApplied = child.events.length;
    const updated = await child.expectScreen((screen) => screen.includes("LABEL-B-HOT"), {
      after: afterApplied,
    });
    expect(updated).toContain("LABEL-B-HOT");
    expect(
      firstCountAfterLabel(child.output().slice(outputAfter), "LABEL-B-HOT"),
    ).toBeGreaterThanOrEqual(beforeCount);

    await child.quiesce(100, {
      ignore: (event) => event.ev === "paint:committed",
    });
    expect(child.events.slice(after).map(({ ev }) => ev)).not.toContain("app:setup-ran");
    expect(child.events.slice(after).map(({ ev }) => ev)).not.toContain("app:mounted");
    expect(child.events.slice(after).map(({ ev }) => ev)).not.toContain("app:unmounted");
  });
});

// The first test deliberately uses the old output-checker's SSR helper token as
// user text. Compiler modes are constrained at configuration time; scanning
// generated JavaScript for helper names made this valid app fail.
