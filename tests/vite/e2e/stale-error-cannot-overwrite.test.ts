import { expect, test } from "vite-plus/test";
import { type ViteChild } from "./harness/child.ts";
import { createScratchFixture } from "./harness/scratch.ts";
import { withViteChild } from "./harness/e2e.ts";

const OLD_FAILURE_MARKER = "ORDERING-OLD-FAILURE";
const NEWER_LABEL = "NEWER-B";

async function childHasExited(child: ViteChild, waitMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      child.exited.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), waitMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

test("an older delayed runner error cannot overwrite a newer successful update", async () => {
  const scratch = createScratchFixture("overlay");
  const originalApp = scratch.read("src/app.vue");
  const originalTarget = scratch.read("src/target.vue");
  scratch.write("src/ordering-sentinel.ts", "export const orderingSentinel = 0;\n");
  scratch.write(
    "src/app.vue",
    originalApp.replace(
      'import Target from "./target.vue";',
      'import "./ordering-sentinel.ts";\nimport Target from "./target.vue";',
    ),
  );
  scratch.write(
    "vite.config.ts",
    `import { defineConfig } from "vite";
import { resolve } from "node:path";
import vue from "unplugin-vue/vite";
import { emitTestEvent } from "@vue-tui/runtime/internal/testing";
import { vueTui } from "@vue-tui/vite";

const appFile = resolve(process.cwd(), "src/app.vue");
const sentinelFile = resolve(process.cwd(), "src/ordering-sentinel.ts");

function holdRunnerError() {
  let transport;
  let pendingContext;
  const held = [];
  let holding = true;

  return {
    name: "test:hold-runner-error",
    configureServer(server) {
      const hot = server.environments.ssr.hot;
      transport = hot.send.bind(hot);
      hot.send = (...args) => {
        const isContext = args[0] === "vue-tui:hmr-error-context";
        const isError = typeof args[0] !== "string" && args[0].type === "error";
        if (holding && isContext) {
          pendingContext = args;
          return;
        }
        if (holding && isError && pendingContext !== undefined) {
          held.push(pendingContext, args);
          pendingContext = undefined;
          if (held.length === 2) emitTestEvent("ordering:error-held");
          return;
        }
        transport(...args);
      };
    },
    hotUpdate: {
      async handler(options) {
        if (options.file !== sentinelFile) return;
        if (this.environment.name === "ssr") {
          if (transport === undefined || held.length === 0) {
            throw new Error("ordering sentinel changed before a runner error was held");
          }
          holding = false;
          for (const args of held) transport(...args);
          held.length = 0;
          emitTestEvent("ordering:error-flushed");
        }
        return [];
      },
    },
  };
}

function failMarkedUpdate() {
  return {
    name: "test:fail-marked-update",
    async hotUpdate(options) {
      if (options.file !== appFile) return;
      if (!(await options.read()).includes("${OLD_FAILURE_MARKER}")) return;
      throw Object.assign(new Error("${OLD_FAILURE_MARKER}"), { id: options.file });
    },
  };
}

export default defineConfig({
  plugins: [vue(), holdRunnerError(), ...vueTui(), failMarkedUpdate()],
});
`,
  );

  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await child.expectScreen((screen) => screen.includes("LABEL-A"));

    const failureAfter = child.events.length;
    scratch.write(
      "src/app.vue",
      scratch
        .read("src/app.vue")
        .replace('const label = "LABEL-A";', `const label = "${OLD_FAILURE_MARKER}";`),
    );
    await child.expectEvent("ordering:error-held", { after: failureAfter });

    const successAfter = child.events.length;
    scratch.write("src/target.vue", originalTarget.replace("TARGET-A", NEWER_LABEL));
    await child.expectEvent("hmr:update-applied", { after: successAfter });
    await expect(child.expectScreen((screen) => screen.includes(NEWER_LABEL))).resolves.toContain(
      NEWER_LABEL,
    );

    const flushAfter = child.events.length;
    scratch.write("src/ordering-sentinel.ts", "export const orderingSentinel = 1;\n");
    await child.expectEvent("ordering:error-flushed", { after: flushAfter });
    await child.expectEvent("hmr:error", { after: flushAfter });
    await child.quiesce(250, {
      ignore: (event) => event.ev === "paint:committed" || event.ev === "hmr:error",
    });

    const settledScreen = await child.screen();
    expect(settledScreen).toContain(NEWER_LABEL);
    expect(settledScreen).not.toContain("Build Error");
    await expect(childHasExited(child, 100)).resolves.toBe(false);
  });
});
