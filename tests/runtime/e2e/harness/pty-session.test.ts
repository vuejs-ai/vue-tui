import process from "node:process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test, vi } from "vite-plus/test";
import { startPtySession, type PtySession } from "./pty-session.ts";

const fixture = fileURLToPath(new URL("../pty/fixtures/suspension.tsx", import.meta.url));
let abandoned: PtySession | undefined;

afterAll(() => {
  abandoned?.killNow("SIGKILL");
});

test("a PTY session left by a test is cleaned up automatically", async () => {
  abandoned = startPtySession({
    command: [process.execPath, "--import=tsx", fixture, "16", "fullscreen"],
    cwd: dirname(fixture),
    readyToken: "__READY__",
  });
  await abandoned.waitForOutput((output) => output.includes("__READY__:fullscreen:"));
});

test("the previous test's PTY process has exited", async () => {
  await vi.waitFor(() => expect(abandoned?.exited).toBe(true), { timeout: 2_000 });
});
