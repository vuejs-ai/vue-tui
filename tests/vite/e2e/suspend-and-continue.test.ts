import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "vite-plus/test";
import { createScratchFixture } from "./harness/scratch.ts";
import { withViteChild } from "./harness/e2e.ts";

const execFileAsync = promisify(execFile);

async function waitForStoppedProcess(pid: number, timeoutMs = 2_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastState = "<unavailable>";
  do {
    try {
      const { stdout } = await execFileAsync("ps", ["-o", "stat=", "-p", String(pid)]);
      lastState = stdout.trim();
      if (lastState.startsWith("T")) return lastState;
    } catch (error) {
      lastState = error instanceof Error ? error.message : String(error);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  } while (Date.now() < deadline);

  throw new Error(`Process ${pid} did not stop within ${timeoutMs}ms (last state: ${lastState})`);
}

test.skipIf(process.platform === "win32")(
  "releases and reacquires a real terminal across SIGTSTP and SIGCONT",
  async () => {
    const scratch = createScratchFixture("input-hmr");
    await withViteChild(
      scratch,
      async (child) => {
        await child.expectEvent("terminal:acquired");
        await child.expectEvent("app:mounted");
        await expect(
          child.expectScreen(
            (screen) => screen.includes("generation=A") && screen.includes("viewport=80x24"),
          ),
        ).resolves.toContain("INPUT-LABEL-A");
        const initialMountCount = child.events.filter((event) => event.ev === "app:mounted").length;

        const rawOutputAfter = child.output().length;
        const rawInputAfter = child.events.length;
        child.write("u");
        await expect(
          child.expectEvent("input:received", {
            after: rawInputAfter,
            predicate: (event) => (event.data as { input?: string } | undefined)?.input === "u",
          }),
        ).resolves.toMatchObject({ data: { input: "u" } });
        await child.quiesce(50);
        expect(child.output().slice(rawOutputAfter)).not.toContain("u");

        const suspendAfter = child.events.length;
        child.kill("SIGTSTP");
        await child.expectEvent("terminal:released", { after: suspendAfter });
        await expect(waitForStoppedProcess(child.pid)).resolves.toMatch(/^T/);

        const cookedOutputAfter = child.output().length;
        child.write("COOKED-ECHO\n");
        await child.expectOutput("COOKED-ECHO", { after: cookedOutputAfter });
        expect(child.output().slice(cookedOutputAfter)).toContain("COOKED-ECHO");

        await child.resize(72, 12);
        const resumeAfter = child.events.length;
        child.kill("SIGCONT");
        await child.expectEvent("terminal:acquired", { after: resumeAfter });
        await expect(
          child.expectScreen(
            (screen) => screen.includes("generation=A") && screen.includes("viewport=72x12"),
            { after: resumeAfter },
          ),
        ).resolves.toContain("INPUT-LABEL-A");
        expect(child.events.filter((event) => event.ev === "app:mounted")).toHaveLength(
          initialMountCount,
        );
        expect(child.events).not.toContainEqual(expect.objectContaining({ ev: "app:unmounted" }));

        const resumedRawOutputAfter = child.output().length;
        const resumedInputAfter = child.events.length;
        child.write("z");
        await expect(
          child.expectEvent("input:received", {
            after: resumedInputAfter,
            predicate: (event) => (event.data as { input?: string } | undefined)?.input === "z",
          }),
        ).resolves.toMatchObject({ data: { input: "z" } });
        await child.quiesce(50);
        expect(child.output().slice(resumedRawOutputAfter)).not.toContain("z");
      },
      { columns: 80, rows: 24 },
    );
  },
);
