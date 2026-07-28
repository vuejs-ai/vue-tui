import { expect, test } from "vite-plus/test";
import { createScratchFixture } from "./harness/scratch.ts";
import { withViteChild } from "./harness/e2e.ts";

// @vitejs/plugin-vue-jsx has no supported client-output option. vueTui() therefore supplies its
// missing hook argument narrowly for JSX; without that patch, .tsx compiles in SSR mode and paints
// a blank frame. Launching the fixture's real config keeps that plugin composition intact.
test("JSX (.tsx) components render through the real Vite CLI", async () => {
  const scratch = createScratchFixture("jsx");
  scratch.edit("src/app.tsx", (source) =>
    source.replace("JSX-LABEL", "JSX-LABEL /__vue-jsx-ssr-register-helper ssrRegisterHelper("),
  );
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await expect(child.expectScreen((screen) => screen.includes("JSX-LABEL"))).resolves.toContain(
      "JSX-LABEL",
    );
  });
});
