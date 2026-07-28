import { expect, test } from "vite-plus/test";
import { childExitWithin } from "./harness/child.ts";
import { createScratchFixture } from "./harness/scratch.ts";
import { withViteChild } from "./harness/e2e.ts";

test("a genuine app exit closes the real Vite CLI process", async () => {
  const scratch = createScratchFixture("exit");
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await expect(
      child.expectScreen((screen) => screen.includes("EXIT-FIXTURE")),
    ).resolves.toContain("EXIT-FIXTURE");
    await expect(child.expectEvent("app:exit")).resolves.toMatchObject({
      data: { code: 0 },
    });
    await expect(childExitWithin(child)).resolves.toMatchObject({ exitCode: 0 });
  });
});

// The harness disposes a child by writing Ctrl-C and then escalating to SIGTERM
// and SIGKILL, so a Ctrl-C that stopped working would only slow disposal down and
// fail nothing. This is the one place that requires the keypress alone to bring
// the dev server down.
test("Ctrl-C alone terminates the dev server", async () => {
  const scratch = createScratchFixture("basic");
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await expect(child.expectScreen((screen) => screen.includes("LABEL-A"))).resolves.toContain(
      "LABEL-A",
    );

    // Nothing else can end the child here: disposal, with its signal escalation,
    // only runs after this body returns.
    //
    // The keypress kills the process before `waitUntilExit()` can settle, so
    // neither `app:exit` nor the launcher's final protocol acknowledgement can
    // arrive. That unclean disconnect is the behavior under assertion.
    child.allowUncleanExit("Ctrl-C terminates the process, which is what this asserts");
    child.write("\x03");
    await expect(childExitWithin(child, 5_000)).resolves.toBeDefined();
  });
});
