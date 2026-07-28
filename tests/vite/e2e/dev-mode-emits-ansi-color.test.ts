import { expect, test } from "vite-plus/test";
import { createScratchFixture } from "./harness/scratch.ts";
import { withViteChild } from "./harness/e2e.ts";

const GREEN = "\x1b[32m";
const FG_RESET = "\x1b[39m";

test("#214: dev-mode Text color emits real ANSI color through the real Vite CLI", async () => {
  const scratch = createScratchFixture("color");
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await expect(child.expectScreen((screen) => screen.includes("COLORTEST"))).resolves.toContain(
      "COLORTEST",
    );
    expect(child.output()).toContain(`${GREEN}COLORTEST${FG_RESET}`);
  });
});
