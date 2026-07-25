import { expect, test } from "vite-plus/test";
import { createTerminalEmulator } from "../src/emulator.ts";

test("dispose is idempotent while output is queued", async () => {
  const emulator = createTerminalEmulator(20, 4);
  emulator.write("queued output");

  emulator.dispose();
  emulator.dispose();

  await expect(emulator.flush()).rejects.toThrow("Test host has been disposed.");
});

test("resize is ordered after pending terminal output", async () => {
  const emulator = createTerminalEmulator(4, 2);
  emulator.write("\x1b[?1049h\x1b[2J\x1b[HABCDEFGH");

  await emulator.resize(8, 2);
  const screen = await emulator.snapshot();

  expect(screen.activeBuffer).toBe("alternate");
  expect(screen.lines.map((line) => line.trimEnd())).toEqual(["ABCD", "EFGH"]);
  emulator.dispose();
});

test("snapshot reports the terminal cursor visibility mode", async () => {
  const emulator = createTerminalEmulator(10, 3);

  expect((await emulator.snapshot()).cursor.visible).toBe(true);

  emulator.write("\x1b[?25l");
  expect((await emulator.snapshot()).cursor.visible).toBe(false);

  emulator.write("\x1b[?25h");
  expect((await emulator.snapshot()).cursor.visible).toBe(true);
  emulator.dispose();
});
