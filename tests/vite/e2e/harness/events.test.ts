import type { Socket } from "node:net";
import { expect, test } from "vite-plus/test";
import { createEventAddress } from "./address.ts";
import {
  connectToChannel as connect,
  createEventChannel,
  type EventChannel,
  EventChannelPrematureCloseError,
} from "./events.ts";
import { EVENT_STREAM_END, EVENT_STREAM_END_REQUEST } from "./protocol.ts";

async function closePair(channel: EventChannel, socket: Socket): Promise<void> {
  socket.destroy();
  await channel.close();
}

test("creates short unique event addresses for this platform", () => {
  const first = createEventAddress();
  const second = createEventAddress();
  expect(first).not.toBe(second);
  if (process.platform === "win32") {
    expect(first).toMatch(/^\\\\\.\\pipe\\vue-tui-hmr-/);
  } else {
    expect(first).toMatch(/vue-tui-hmr-.*\.sock$/);
    expect(Buffer.byteLength(first)).toBeLessThan(100);
  }
});

test("splits combined and fragmented UTF-8 event lines in receive order", async () => {
  const channel = await createEventChannel();
  const socket = await connect(channel);
  try {
    socket.write('{"seq":1,"ev":"app:mounted"}\n{"seq":2,"ev":"hmr:update-received"}\n');
    const unicodeLine = Buffer.from(
      '{"seq":4,"ev":"fixture:unicode","data":{"label":"新"}}\n',
      "utf8",
    );
    const splitAt = unicodeLine.indexOf(Buffer.from("新")) + 1;
    socket.write('{"seq":3,"ev":"paint:committed"}\n');
    socket.write(unicodeLine.subarray(0, splitAt));
    socket.write(unicodeLine.subarray(splitAt));

    await channel.expectEvent("fixture:unicode");
    expect(channel.events).toEqual([
      { seq: 1, ev: "app:mounted" },
      { seq: 2, ev: "hmr:update-received" },
      { seq: 3, ev: "paint:committed" },
      { seq: 4, ev: "fixture:unicode", data: { label: "新" } },
    ]);
  } finally {
    await closePair(channel, socket);
  }
});

test("waits after a log cursor and filters repeated event names", async () => {
  const channel = await createEventChannel();
  const socket = await connect(channel);
  try {
    socket.write('{"seq":1,"ev":"hmr:update-received"}\n');
    await channel.expectEvent("hmr:update-received");
    const after = channel.events.length;
    const second = channel.expectEvent("hmr:update-received", {
      after,
      predicate: (event) => (event.data as { kind?: string } | undefined)?.kind === "full-reload",
    });
    socket.write('{"seq":2,"ev":"hmr:update-received"}\n');
    socket.write('{"seq":3,"ev":"hmr:update-received","data":{"kind":"full-reload"}}\n');
    await expect(second).resolves.toMatchObject({
      seq: 3,
      data: { kind: "full-reload" },
    });
  } finally {
    await closePair(channel, socket);
  }
});

// The channel names what it waited for; the ordered log that goes with it is
// attached by ViteChild, and `diagnostics.test.ts` pins that half. This used to
// be one claim asserted here, which printed the whole log twice in every real
// failure because ViteChild adds it too.
test("names the awaited event and the elapsed timeout when a wait expires", async () => {
  const channel = await createEventChannel();
  const socket = await connect(channel);
  try {
    socket.write('{"seq":1,"ev":"app:mounted"}\n');
    await channel.expectEvent("app:mounted");
    await expect(channel.expectEvent("never", { timeoutMs: 20 })).rejects.toThrow(
      /Timed out after 20ms waiting for event "never"/,
    );
  } finally {
    await closePair(channel, socket);
  }
});

test("rejects malformed JSON and non-increasing sequence numbers", async () => {
  const malformed = await createEventChannel();
  const malformedSocket = await connect(malformed);
  try {
    const waiting = malformed.expectEvent("app:mounted");
    malformedSocket.write("not-json\n");
    await expect(waiting).rejects.toThrow(/invalid JSON/i);
    expect(malformed.failure).not.toBeInstanceOf(EventChannelPrematureCloseError);
  } finally {
    await closePair(malformed, malformedSocket);
  }

  const duplicate = await createEventChannel();
  const duplicateSocket = await connect(duplicate);
  try {
    duplicateSocket.write('{"seq":2,"ev":"first"}\n{"seq":2,"ev":"second"}\n');
    await duplicate.expectEvent("first");
    await expect(duplicate.expectEvent("second")).rejects.toThrow(/strictly increasing/i);
    expect(duplicate.failure).not.toBeInstanceOf(EventChannelPrematureCloseError);
  } finally {
    await closePair(duplicate, duplicateSocket);
  }
});

test("rejects pending waits when the event stream disconnects", async () => {
  const channel = await createEventChannel();
  const socket = await connect(channel);
  const waiting = channel.expectEvent("app:mounted");
  socket.end('{"seq":1');
  try {
    await expect(waiting).rejects.toThrow(/partial event line/i);
    expect(channel.failure).not.toBeInstanceOf(EventChannelPrematureCloseError);
  } finally {
    await channel.close();
  }
});

test("rejects a complete disconnect that lacks the final stream event", async () => {
  const channel = await createEventChannel();
  const socket = await connect(channel);
  try {
    socket.end('{"seq":1,"ev":"app:mounted"}\n');
    await channel.expectEvent("app:mounted");
    await expect(channel.expectEvent("after-disconnect")).rejects.toThrow(
      /before the final harness:event-stream-end/i,
    );
    expect(channel.failure).toBeInstanceOf(EventChannelPrematureCloseError);
    expect(channel.failure?.message).toMatch(/before the final harness:event-stream-end/i);
  } finally {
    await channel.close();
  }
});

test("keeps reporting after an app generation exits and completes on the stream event", async () => {
  const channel = await createEventChannel();
  const changes: number[] = [];
  const unsubscribe = channel.onChange(() => {
    changes.push(channel.events.length);
  });
  const socket = await connect(channel);
  try {
    socket.end(
      `{"seq":1,"ev":"app:exit","data":{"code":0}}\n` +
        `{"seq":2,"ev":"app:mounted","data":{"generation":2}}\n` +
        `{"seq":3,"ev":${JSON.stringify(EVENT_STREAM_END)}}\n`,
    );
    await expect(channel.expectEvent("app:exit")).resolves.toMatchObject({
      data: { code: 0 },
    });
    await expect(channel.expectEvent("app:mounted")).resolves.toMatchObject({
      data: { generation: 2 },
    });
    await expect(channel.expectEvent(EVENT_STREAM_END)).resolves.toMatchObject({ seq: 3 });
    await expect(channel.expectEvent("after-stream")).rejects.toThrow(/completed/i);
    expect(channel.failure).toBeUndefined();
    expect(changes).toEqual([1, 2, 3, 3]);
  } finally {
    unsubscribe();
    await channel.close();
  }
});

test("requests a final stream event and waits for the launcher acknowledgement", async () => {
  const channel = await createEventChannel();
  const socket = await connect(channel);
  socket.setEncoding("utf8");
  socket.once("data", (request: string) => {
    expect(request).toBe(EVENT_STREAM_END_REQUEST);
    socket.end(`{"seq":1,"ev":${JSON.stringify(EVENT_STREAM_END)}}\n`);
  });
  try {
    await expect(channel.finish(100)).resolves.toBeUndefined();
    expect(channel.failure).toBeUndefined();
  } finally {
    await channel.close();
  }
});

test("a disconnect at the finish deadline can never resolve as healthy", async () => {
  const channel = await createEventChannel();
  const socket = await connect(channel);
  try {
    const finishing = channel.finish(20);
    setTimeout(() => socket.destroy(), 19);
    await expect(finishing).resolves.toBeInstanceOf(Error);
    expect(channel.failure).toBeInstanceOf(Error);
  } finally {
    await channel.close();
  }
});

test("rejects pending waits when the channel closes", async () => {
  const channel = await createEventChannel();
  const waiting = channel.expectEvent("app:mounted");
  const rejected = expect(waiting).rejects.toThrow(/event channel closed/i);
  await channel.close();
  await rejected;
});

test("keeps concurrent event channels isolated", async () => {
  const first = await createEventChannel();
  const second = await createEventChannel();
  const firstSocket = await connect(first);
  const secondSocket = await connect(second);
  try {
    firstSocket.write('{"seq":1,"ev":"first-child"}\n');
    secondSocket.write('{"seq":1,"ev":"second-child"}\n');
    await Promise.all([first.expectEvent("first-child"), second.expectEvent("second-child")]);
    expect(first.events.map(({ ev }) => ev)).toEqual(["first-child"]);
    expect(second.events.map(({ ev }) => ev)).toEqual(["second-child"]);
  } finally {
    await Promise.all([closePair(first, firstSocket), closePair(second, secondSocket)]);
  }
});

test("can ignore paint traffic while waiting for non-paint quiescence", async () => {
  const channel = await createEventChannel();
  const socket = await connect(channel);
  try {
    const quiet = channel.quiesce(30, {
      ignore: (event) => event.ev === "paint:committed",
    });
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        socket.write('{"seq":1,"ev":"paint:committed"}\n');
        resolve();
      }, 10);
    });
    await expect(quiet).resolves.toBeUndefined();
  } finally {
    await closePair(channel, socket);
  }
});
