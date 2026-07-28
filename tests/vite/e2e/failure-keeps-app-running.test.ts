import { expect, test } from "vite-plus/test";
import { createScratchFixture } from "./harness/scratch.ts";
import {
  errorPanel,
  eventPhase,
  latestCount,
  settleViteWatchChange,
  withViteChild,
} from "./harness/e2e.ts";

function preservesLayoutObservations(screen: string, label: string): boolean {
  return (
    screen.includes(label) &&
    /layout=\d+x24/.test(screen) &&
    screen.includes("box=7x2") &&
    !screen.includes("box=pending")
  );
}

test("a script hot update recreates setup and preserves public layout observations", async () => {
  const scratch = createScratchFixture("overlay");
  const originalApp = scratch.read("src/app.vue");
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await child.expectEvent("app:setup-ran");
    await expect(
      child.expectScreen((screen) => preservesLayoutObservations(screen, "LABEL-A")),
    ).resolves.toContain("box=7x2");

    const after = child.events.length;
    scratch.write(
      "src/app.vue",
      originalApp.replace('const label = "LABEL-A";', 'const label = "LABEL-B-HOT";'),
    );
    await child.expectEvent("hmr:update-received", { after });
    await child.expectEvent("app:setup-ran", { after });
    await child.expectEvent("hmr:update-applied", { after });
    const afterApplied = child.events.length;
    await expect(
      child.expectScreen((screen) => preservesLayoutObservations(screen, "LABEL-B-HOT"), {
        after: afterApplied,
      }),
    ).resolves.toContain("box=7x2");
  });
});

test("a build error with layout consumers recovers without a render-session failure", async () => {
  const scratch = createScratchFixture("overlay");
  const originalApp = scratch.read("src/app.vue");
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await child.expectEvent("app:setup-ran");
    const initialScreen = await child.expectScreen((screen) =>
      preservesLayoutObservations(screen, "LABEL-A"),
    );
    expect(initialScreen).toContain("layout=80x24");
    const initialCount = latestCount(initialScreen);
    expect(initialCount).toBeDefined();

    const failureAfter = child.events.length;
    scratch.write(
      "src/app.vue",
      originalApp.replace('const label = "LABEL-A";', "const label = ;"),
    );
    await expect(
      child.expectEvent("hmr:error", {
        after: failureAfter,
        predicate: (event) => eventPhase(event) === "compile",
      }),
    ).resolves.toMatchObject({ data: { phase: "compile" } });
    await expect(child.expectScreen((screen) => screen.includes("Build Error"))).resolves.toContain(
      "Build Error",
    );
    await child.quiesce(250, {
      ignore: (event) => event.ev === "paint:committed",
    });
    const errorScreen = await child.screen();
    expect(errorScreen).toContain("layout=80x24");
    expect(errorScreen).toContain("render-ok");
    expect(errorScreen).toContain("Build Error");
    expect(latestCount(errorScreen)).toBeGreaterThan(initialCount!);
    expect(child.output()).not.toContain(
      "render session is unavailable outside a vue-tui render tree",
    );

    const recoveryAfter = child.events.length;
    scratch.write("src/app.vue", originalApp);
    await child.expectEvent("hmr:update-received", { after: recoveryAfter });
    await child.expectEvent("app:setup-ran", { after: recoveryAfter });
    await child.expectEvent("hmr:update-applied", { after: recoveryAfter });
    await expect(
      child.expectScreen((screen) => preservesLayoutObservations(screen, "LABEL-A")),
    ).resolves.toContain("box=7x2");
    expect(child.output()).not.toContain(
      "render session is unavailable outside a vue-tui render tree",
    );
  });
});

test("a render throw is held by the dev overlay and a template fix recovers in place", async () => {
  const scratch = createScratchFixture("overlay");
  const originalApp = scratch.read("src/app.vue");
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await child.expectEvent("app:setup-ran");
    await expect(
      child.expectScreen(
        (screen) => preservesLayoutObservations(screen, "LABEL-A") && screen.includes("render-ok"),
      ),
    ).resolves.toContain("render-ok");

    const failureAfter = child.events.length;
    scratch.write("src/app.vue", originalApp.replace("renderProbe(false)", "renderProbe(true)"));
    await child.expectEvent("hmr:update-received", { after: failureAfter });
    await expect(
      child.expectEvent("hmr:error", {
        after: failureAfter,
        predicate: (event) => eventPhase(event) === "render",
      }),
    ).resolves.toMatchObject({ data: { phase: "render" } });
    await expect(
      child.expectScreen(
        (screen) =>
          screen.includes("Render Error") &&
          screen.includes("RENDER-PROBE-FAIL") &&
          screen.includes("held up by the dev overlay"),
      ),
    ).resolves.toContain("RENDER-PROBE-FAIL");
    await child.quiesce(250, {
      ignore: (event) => event.ev === "paint:committed",
    });
    expect(
      child.events
        .slice(failureAfter)
        .filter((event) => event.ev === "hmr:error" && eventPhase(event) === "render"),
    ).toHaveLength(1);
    expect(child.events.filter((event) => event.ev === "app:setup-ran")).toHaveLength(1);

    const recoveryAfter = child.events.length;
    scratch.write("src/app.vue", originalApp);
    await child.expectEvent("hmr:update-received", { after: recoveryAfter });
    await child.expectEvent("hmr:update-applied", { after: recoveryAfter });
    await expect(
      child.expectScreen(
        (screen) => preservesLayoutObservations(screen, "LABEL-A") && screen.includes("render-ok"),
      ),
    ).resolves.toContain("render-ok");
    expect(child.events.filter((event) => event.ev === "app:setup-ran")).toHaveLength(1);
  });
});

// A throw from setup() reaches the same place a render throw does: the generated
// accept callback recreates the instance inside Vite's fetchUpdate closure, which
// has no catch. Left uncaught it becomes an unhandled rejection and Node ends the
// dev process — the most ordinary Vue mistake there is, and the one shape the
// render-only boundary missed.
test("a setup throw is held by the dev overlay instead of ending the dev process", async () => {
  const scratch = createScratchFixture("overlay");
  const originalApp = scratch.read("src/app.vue");
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await expect(child.expectScreen((screen) => screen.includes("LABEL-A"))).resolves.toContain(
      "LABEL-A",
    );

    const failureAfter = child.events.length;
    scratch.write(
      "src/app.vue",
      originalApp.replace(
        '<script setup lang="ts">',
        '<script setup lang="ts">\nthrow new Error("SETUP-PROBE-FAIL");',
      ),
    );
    await expect(
      child.expectScreen(
        (screen) =>
          screen.includes("SETUP-PROBE-FAIL") && screen.includes("held up by the dev overlay"),
      ),
    ).resolves.toContain("SETUP-PROBE-FAIL");
    await settleViteWatchChange(child);

    // The process must still be alive and able to take the next update.
    const recoveryAfter = child.events.length;
    scratch.write("src/app.vue", originalApp);
    await child.expectEvent("hmr:update-applied", { after: recoveryAfter });
    await expect(child.expectScreen((screen) => screen.includes("LABEL-A"))).resolves.toContain(
      "LABEL-A",
    );
    expect(child.events.slice(failureAfter).some((event) => event.ev === "app:exit")).toBe(false);
  });
});

// Fullscreen commits by line diff, so this also keeps the frame oracle honest:
// each assertion receives the Runtime's complete committed frame and succeeds
// only when its visible rows are present in the xterm viewport.
test("a build error and its recovery are shown in place on a Fullscreen surface", async () => {
  const scratch = createScratchFixture("fullscreen");
  const originalApp = scratch.read("src/app.vue");

  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await child.expectEvent("app:setup-ran");

    const booted = await child.expectFrame(
      (frame) => frame.includes("FULLSCREEN-A") && latestCount(frame) !== undefined,
    );
    expect(booted).toContain("STABLE-ROW-1");
    expect(booted).toContain("STABLE-ROW-2");
    expect(latestCount(booted), "the boot frame must carry the counter row").toBeDefined();

    const failureAfter = child.events.length;
    scratch.write(
      "src/app.vue",
      originalApp.replace("const count = shallowRef(0);", "const broken = ;"),
    );
    await child.expectEvent("hmr:error", { after: failureAfter });

    // Fullscreen clears the alternate screen for its opaque overlay, unlike
    // Inline's panel below the live frame. The stable contract here is that the
    // real error is visible, the app is not torn down, and recovery is in place.
    await child.expectFrame((frame) => errorPanel(frame)?.includes("Unexpected token") === true, {
      after: failureAfter,
    });
    await settleViteWatchChange(child);

    const recoveryAfter = child.events.length;
    scratch.write("src/app.vue", originalApp.replace("FULLSCREEN-A", "FULLSCREEN-RECOVERED"));
    await child.expectEvent("hmr:update-applied", { after: recoveryAfter });

    const recovered = await child.expectFrame((frame) => frame.includes("FULLSCREEN-RECOVERED"), {
      after: recoveryAfter,
    });
    expect(errorPanel(recovered)).toBeUndefined();
    expect(recovered).toContain("STABLE-ROW-1");
    expect(child.events.filter((event) => event.ev === "app:unmounted")).toHaveLength(0);
  });
});

/** A self-accepting module that throws the given expression from its callback. */
function hotProbe(revision: number, thrown: string, asynchronous = false): string {
  const asyncKeyword = asynchronous ? "async " : "";
  return `export const probe = ${revision};\nif (import.meta.hot) {\n  import.meta.hot.accept(${asyncKeyword}() => {\n    throw ${thrown};\n  });\n}\n`;
}

// The general form: Vite calls accept callbacks inside a try/finally with no
// catch, so ANY throw from one used to escape as an unhandled rejection and end
// the dev process. Pattern-matching the shapes a compiler generates covered
// instances; catching at the runner covers the mechanism, including a callback
// the application wrote itself — which no text-keyed guard could ever recognise.
//
// Both rows matter. JavaScript lets you throw any value, and the first version of
// this guard rethrew anything that was not an `Error` — which is an
// instance-shaped hole in a guard whose whole purpose is to be shape-independent.
// The string row exited with code 1 until the catch stopped discriminating.
for (const [name, thrown, shown, asynchronous] of [
  ["an Error", 'new Error("USER-ACCEPT-BOOM")', "USER-ACCEPT-BOOM", false],
  ["a bare string", '"NON-ERROR-ACCEPT-BOOM"', "NON-ERROR-ACCEPT-BOOM", false],
  ["an async Error", 'new Error("ASYNC-ACCEPT-BOOM")', "ASYNC-ACCEPT-BOOM", true],
] as const) {
  test(`a throw of ${name} from a hand-written accept callback does not end the dev process`, async () => {
    const scratch = createScratchFixture("basic");
    const main = scratch.read("src/main.ts");
    // A self-accepting module of its own, so the update stops there: editing the
    // entry instead would re-run createApp().mount() and the instance-reuse guard
    // would be the first cause, not the callback.
    scratch.write("src/hot-probe.ts", hotProbe(1, thrown, asynchronous));
    scratch.write("src/main.ts", `import "./hot-probe.ts";\n${main}`);
    await withViteChild(scratch, async (child) => {
      await child.expectEvent("app:mounted");

      scratch.write("src/hot-probe.ts", hotProbe(2, thrown, asynchronous));
      await expect(child.expectFrame((frame) => frame.includes(shown))).resolves.toContain(shown);
      await child.quiesce(250, { ignore: (event) => event.ev === "paint:committed" });
      expect(child.events.some((event) => event.ev === "app:exit")).toBe(false);
    });
  });
}
