import { expect, test } from "vite-plus/test";
import { createHarnessScreen, replayScreenFrames } from "./screen.ts";

test("serializes fragmented output and publishes parsed visible text", async () => {
  const changes: string[] = [];
  const screen = createHarnessScreen(8, 2);
  const unsubscribe = screen.onChange(() => {
    changes.push(screen.currentText());
  });
  try {
    screen.write("\x1b[31mHEL");
    screen.write("LO\x1b[0m");
    await screen.flush();
    expect(await screen.text()).toBe("HELLO");
    expect(changes.at(-1)).toBe("HELLO");
    expect(screen.revision).toBeGreaterThan(0);
  } finally {
    unsubscribe();
    await screen.dispose();
  }
});

test("reads the active viewport rather than stale normal-buffer history", async () => {
  const screen = createHarnessScreen(8, 2);
  try {
    screen.write("ONE\r\nTWO\r\nTHREE");
    await screen.flush();
    expect(await screen.text()).toBe("TWO\nTHREE");
  } finally {
    await screen.dispose();
  }
});

test("publishes synchronized output only after the mode closes", async () => {
  const screen = createHarnessScreen(8, 2);
  let changes = 0;
  const unsubscribe = screen.onChange(() => {
    changes++;
  });
  try {
    screen.write("\x1b[?2026hHIDDEN");
    await screen.flush();
    expect(screen.currentText()).toBe("");
    expect(changes).toBe(0);

    screen.write("\x1b[?2026l");
    await screen.flush();
    expect(screen.currentText()).toBe("HIDDEN");
    expect(changes).toBe(1);
  } finally {
    unsubscribe();
    await screen.dispose();
  }
});

test("replays every synchronized frame when one PTY chunk contains multiple transactions", async () => {
  const frame = (count: number): string => `\x1b[?2026h\x1b[2J\x1b[Hcount=${count}\x1b[?2026l`;
  const output = frame(0) + frame(1);
  const frames = await replayScreenFrames(output, 10, 2);
  expect(frames).toEqual([
    { endOffset: frame(0).length, text: "count=0" },
    { endOffset: output.length, text: "count=1" },
  ]);
});

test("queues resize after prior output and forwards terminal query replies", async () => {
  const replies: Array<string | Buffer> = [];
  const changes: string[] = [];
  const screen = createHarnessScreen(4, 2, {
    onData: (data) => {
      replies.push(data);
    },
    onBinary: (data) => {
      replies.push(data);
    },
  });
  const unsubscribe = screen.onChange(() => {
    changes.push(screen.currentText());
  });
  try {
    screen.write("ABCD");
    await screen.resize(2, 2);
    screen.write("\x1b[6n");
    await screen.flush();
    expect(changes.slice(0, 2)).toEqual(["ABCD", "AB"]);
    expect(await screen.text()).toBe("AB");
    expect(replies.join("")).toMatch(/\x1b\[\d+;\d+R/);
  } finally {
    unsubscribe();
    await screen.dispose();
  }
});

test("disposes idempotently and rejects later access", async () => {
  const screen = createHarnessScreen(8, 2);
  screen.write("queued");
  await screen.dispose();
  await screen.dispose();
  expect(() => screen.currentText()).toThrow(/disposed/i);
  expect(() => screen.write("late")).toThrow(/disposed/i);
  await expect(screen.resize(4, 2)).rejects.toThrow(/disposed/i);
});

test("turns screen-listener exceptions into observable model failures", async () => {
  const screen = createHarnessScreen(8, 2);
  const unsubscribe = screen.onChange(() => {
    throw new Error("screen listener failed");
  });
  try {
    await expect(screen.resize(4, 2)).rejects.toThrow(/screen listener failed/i);
    expect(screen.failure?.message).toContain("screen listener failed");
  } finally {
    unsubscribe();
    await screen.dispose();
  }
});

test("records asynchronous terminal-reply failures without an unhandled rejection", async () => {
  const screen = createHarnessScreen(8, 2, {
    async onData() {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      throw new Error("async reply failed");
    },
  });
  let failureResolve: (() => void) | undefined;
  const failureSeen = new Promise<void>((resolve) => {
    failureResolve = resolve;
  });
  const unsubscribe = screen.onChange(() => {
    if (screen.failure !== undefined) {
      failureResolve?.();
    }
  });
  try {
    screen.write("\x1b[6n");
    await failureSeen;
    await expect(screen.flush()).rejects.toThrow(/async reply failed/i);
  } finally {
    unsubscribe();
    await screen.dispose();
  }
});
