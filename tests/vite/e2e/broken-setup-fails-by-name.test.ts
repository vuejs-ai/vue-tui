import { expect, test } from "vite-plus/test";
import { createScratchFixture } from "./harness/scratch.ts";
import { withViteChild } from "./harness/e2e.ts";

test("a deliberately SSR-configured SFC compiler fails by name instead of painting blank", async () => {
  const scratch = createScratchFixture("basic");
  scratch.write(
    "vite.config.ts",
    `
import { defineConfig } from "vite";
import vueSfc from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

export default defineConfig({
  plugins: [vueSfc({ ssr: true }), vueTui()],
});
`,
  );
  await withViteChild(scratch, async (child) => {
    // The plugin rejects the configuration before an app can start, so the
    // launcher cannot complete the event protocol. That is the assertion.
    child.allowUncleanExit("the server is expected to fail during config resolution");
    await child.expectOutput("VueTuiUnsupportedCompilerError");
    expect(child.output()).toContain("unplugin-vue/vite");
    expect(child.output()).toContain("ssr: false");
    expect(child.output()).not.toContain("LABEL-A");
  });
});

test("an existing SSR environment factory fails by name instead of being replaced", async () => {
  const scratch = createScratchFixture("basic");
  scratch.write(
    "vite.config.ts",
    `
import { defineConfig } from "vite";
import vueSfc from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

export default defineConfig({
  environments: {
    ssr: {
      dev: {
        createEnvironment() {
          throw new Error("EXISTING_FACTORY_WAS_CALLED");
        },
      },
    },
  },
  plugins: [vueSfc(), vueTui()],
});
`,
  );
  await withViteChild(scratch, async (child) => {
    // The plugin refuses the setup, so the dev server never starts an app and
    // the event protocol never completes. That is the assertion, not a defect.
    child.allowUncleanExit("the server is expected to fail before mounting an app");
    await child.expectOutput("VueTuiSsrEnvironmentFactoryConflictError");
    const exit = await child.exited;
    expect(exit.exitCode).not.toBe(0);
    expect(child.output()).toContain("environments.ssr.dev.createEnvironment");
    expect(child.output()).not.toContain("EXISTING_FACTORY_WAS_CALLED");
    expect(child.output()).not.toContain("LABEL-A");
  });
});

test("a later configResolved hook cannot replace the SSR environment factory", async () => {
  const scratch = createScratchFixture("basic");
  scratch.write(
    "vite.config.ts",
    `
import { defineConfig } from "vite";
import vueSfc from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

export default defineConfig({
  plugins: [
    vueSfc(),
    vueTui(),
    {
      name: "replace-vue-tui-ssr-environment",
      async configResolved(config) {
        await Promise.resolve();
        config.environments.ssr.dev.createEnvironment = () => {
          throw new Error("REPLACEMENT_FACTORY_WAS_CALLED");
        };
      },
    },
  ],
});
`,
  );
  await withViteChild(scratch, async (child) => {
    // The plugin refuses the setup, so the dev server never starts an app and
    // the event protocol never completes. That is the assertion, not a defect.
    child.allowUncleanExit("the server is expected to fail before mounting an app");
    await child.expectOutput("VueTuiSsrEnvironmentFactoryConflictError");
    const exit = await child.exited;
    expect(exit.exitCode).not.toBe(0);
    expect(child.output()).toContain("was replaced after vueTui");
    expect(child.output()).not.toContain("REPLACEMENT_FACTORY_WAS_CALLED");
    expect(child.output()).not.toContain("LABEL-A");
  });
});

test("server startup rejects an indirectly replaced SSR environment factory", async () => {
  const scratch = createScratchFixture("basic");
  scratch.write(
    "vite.config.ts",
    `
import { defineConfig } from "vite";
import vueSfc from "unplugin-vue/vite";
import { vueTui } from "@vue-tui/vite";

export default defineConfig({
  plugins: [
    vueSfc(),
    vueTui(),
    {
      name: "wrap-vue-tui-ssr-environment",
      configResolved(config) {
        const originalFactory = config.environments.ssr.dev.createEnvironment;
        config.environments.ssr.dev = {
          ...config.environments.ssr.dev,
          createEnvironment(...args) {
            console.error("REPLACEMENT_FACTORY_WAS_CALLED");
            return originalFactory(...args);
          },
        };
      },
    },
  ],
});
`,
  );
  await withViteChild(scratch, async (child) => {
    // The plugin refuses the setup, so the dev server never starts an app and
    // the event protocol never completes. That is the assertion, not a defect.
    child.allowUncleanExit("the server is expected to fail before mounting an app");
    await child.expectOutput("VueTuiSsrEnvironmentFactoryConflictError");
    const exit = await child.exited;
    expect(exit.exitCode).not.toBe(0);
    expect(child.output()).toContain("was replaced after vueTui");
    expect(child.output()).not.toContain("REPLACEMENT_FACTORY_WAS_CALLED");
    expect(child.output()).not.toContain("LABEL-A");
  });
});
