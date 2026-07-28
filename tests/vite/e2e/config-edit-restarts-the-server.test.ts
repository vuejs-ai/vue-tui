import { expect, test } from "vite-plus/test";
import { createScratchFixture } from "./harness/scratch.ts";
import { hasCountAtLeast, withViteChild } from "./harness/e2e.ts";

// External fixtures consume vueTui through its bare package specifier. Vite
// externalizes that dependency when it loads a config, so a config restart keeps
// the plugin module's process-wide session state instead of creating an inline
// source copy with a fresh module scope.
//
// That difference is not cosmetic: it hid a defect where editing vite.config.ts
// aborted the restart entirely ("server restart failed"), leaving the developer's
// config change unapplied, in every real installation while the suite stayed
// green. Anything keyed to module-level state needs a row here.
//
// `@vue-tui/vite` is a workspace dependency of the private tests-vite package.
// It resolves through the package `exports` map to built `dist/index.mjs`, the
// same entry a published install loads. Tarball contents are checked separately
// by the package-boundary suite.
const PUBLISHED_CONFIG = `import { defineConfig } from "vite";
import vue from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

export default defineConfig({ plugins: [vue(), vueTui()] });
`;

test("editing vite.config.ts restarts the dev server and remounts the app", async () => {
  const scratch = createScratchFixture("basic");
  scratch.write("vite.config.ts", PUBLISHED_CONFIG);

  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await expect(child.expectScreen((screen) => screen.includes("LABEL-A"))).resolves.toContain(
      "LABEL-A",
    );

    // Wait for the counter to climb, so a fresh `count=0` afterwards can only
    // come from a new app instance rather than from the original mount.
    await child.expectScreen((screen) => hasCountAtLeast(screen, 5));
    const outputAfter = child.output().length;
    const restartAfter = child.events.length;

    // Exactly what a developer does: touch the config.
    scratch.write("vite.config.ts", `${PUBLISHED_CONFIG}\n// a comment the developer added\n`);

    // `app:exit` ends one application generation, not the child event stream.
    // Observe both sides of the handover: the old renderer releases the terminal
    // before the new renderer acquires it and mounts.
    await child.expectEvent("app:exit", { after: restartAfter, timeoutMs: 30_000 });
    await child.expectEvent("app:mounted", { after: restartAfter, timeoutMs: 30_000 });
    const restartEvents = child.events.slice(restartAfter).map(({ ev }) => ev);
    expect(restartEvents.indexOf("terminal:released")).toBeGreaterThanOrEqual(0);
    expect(restartEvents.indexOf("terminal:acquired")).toBeGreaterThan(
      restartEvents.indexOf("terminal:released"),
    );
    expect(restartEvents.lastIndexOf("app:mounted")).toBeGreaterThan(
      restartEvents.indexOf("app:exit"),
    );

    // The restarted app's own first frame supplies a second, PTY-level proof that
    // this is a new instance rather than the old server silently surviving.
    await child.expectOutput("count=0", { after: outputAfter, timeoutMs: 30_000 });
    const restartOutput = child.output().slice(outputAfter);
    expect(restartOutput).not.toContain("server restart failed");
    expect(restartOutput).not.toContain("only one Vite dev session may be active");
  });
});
