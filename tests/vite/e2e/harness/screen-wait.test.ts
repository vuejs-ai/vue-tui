import type { Socket } from "node:net";
import { expect, test } from "vite-plus/test";
import { connectToChannel as connect, createEventChannel, type EventChannel } from "./events.ts";
import { createHarnessScreen, type HarnessScreen } from "./screen.ts";
import { waitForScreen } from "./screen-wait.ts";

async function close(channel: EventChannel, socket: Socket, screen: HarnessScreen): Promise<void> {
  socket.destroy();
  await channel.close();
  await screen.dispose();
}

function diagnostic(error: Error): Error {
  return new Error(`SCREEN WAIT DIAGNOSTIC: ${error.message}`, { cause: error });
}

test("rechecks parsed PTY output after the paint event arrives first", async () => {
  const channel = await createEventChannel();
  const socket = await connect(channel);
  const screen = createHarnessScreen(20, 2);
  try {
    const waiting = waitForScreen(
      channel,
      screen,
      (text) => text.includes("EVENT-FIRST"),
      diagnostic,
    );
    socket.write('{"seq":1,"ev":"paint:committed"}\n');
    await channel.expectEvent("paint:committed");
    screen.write("EVENT-FIRST");
    await expect(waiting).resolves.toContain("EVENT-FIRST");
  } finally {
    await close(channel, socket, screen);
  }
});

test("accepts later PTY parsing when the default wait starts after its paint event", async () => {
  const channel = await createEventChannel();
  const socket = await connect(channel);
  const screen = createHarnessScreen(20, 2);
  try {
    socket.write('{"seq":1,"ev":"paint:committed"}\n');
    await channel.expectEvent("paint:committed");
    const waiting = waitForScreen(channel, screen, (text) => text.includes("LATE-PTY"), diagnostic);
    screen.write("LATE-PTY");
    await expect(waiting).resolves.toContain("LATE-PTY");
  } finally {
    await close(channel, socket, screen);
  }
});

test("does not resolve on parsed PTY output until a later paint event arrives", async () => {
  const channel = await createEventChannel();
  const socket = await connect(channel);
  const screen = createHarnessScreen(20, 2);
  try {
    let resolved = false;
    const waiting = waitForScreen(
      channel,
      screen,
      (text) => text.includes("OUTPUT-FIRST"),
      diagnostic,
    ).then((text) => {
      resolved = true;
      return text;
    });
    screen.write("OUTPUT-FIRST");
    await screen.flush();
    await Promise.resolve();
    expect(resolved).toBe(false);

    socket.write('{"seq":1,"ev":"paint:committed"}\n');
    await expect(waiting).resolves.toContain("OUTPUT-FIRST");
  } finally {
    await close(channel, socket, screen);
  }
});

test("accepts a screen claim that is already visibly true", async () => {
  const channel = await createEventChannel();
  const screen = createHarnessScreen(20, 2);
  try {
    screen.write("ALREADY-VISIBLE");
    await screen.flush();
    await expect(
      waitForScreen(channel, screen, (text) => text.includes("ALREADY-VISIBLE"), diagnostic),
    ).resolves.toContain("ALREADY-VISIBLE");
  } finally {
    await channel.close();
    await screen.dispose();
  }
});

test("requires a fresh paint when the caller provides an explicit event cursor", async () => {
  const channel = await createEventChannel();
  const socket = await connect(channel);
  const screen = createHarnessScreen(20, 2);
  try {
    screen.write("STALE-BUT-MATCHING");
    await screen.flush();
    let resolved = false;
    const waiting = waitForScreen(
      channel,
      screen,
      (text) => text.includes("STALE-BUT-MATCHING"),
      diagnostic,
      { after: channel.events.length },
    ).then((text) => {
      resolved = true;
      return text;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    socket.write('{"seq":1,"ev":"paint:committed"}\n');
    await expect(waiting).resolves.toContain("STALE-BUT-MATCHING");
  } finally {
    await close(channel, socket, screen);
  }
});

test("adds child diagnostics to event-channel failures", async () => {
  const channel = await createEventChannel();
  const socket = await connect(channel);
  const screen = createHarnessScreen(20, 2);
  try {
    const waiting = waitForScreen(channel, screen, () => false, diagnostic);
    socket.write("not-json\n");
    await expect(waiting).rejects.toThrow(/SCREEN WAIT DIAGNOSTIC.*invalid JSON/is);
  } finally {
    await close(channel, socket, screen);
  }
});

test("rejects invalid wait options through the promise API", async () => {
  const channel = await createEventChannel();
  const screen = createHarnessScreen(20, 2);
  try {
    await expect(
      waitForScreen(channel, screen, () => false, diagnostic, { timeoutMs: 0 }),
    ).rejects.toThrow(/positive finite/i);
  } finally {
    await channel.close();
    await screen.dispose();
  }
});
