import { PassThrough, Readable } from "node:stream";
import { defineComponent, h } from "vue";
import { expect, test } from "vite-plus/test";
import { Text } from "../index.ts";
import { createApp, type MountOptions } from "../render.ts";
import {
  INTERNAL_RENDER_OBSERVER,
  type InternalContentFrame,
  type InternalRenderObserver,
} from "./render-observer.ts";

async function run(observer?: InternalRenderObserver): Promise<string> {
  const chunks: string[] = [];
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { isTTY: false, columns: 20, rows: 5 });
  stdout.on("data", (chunk) => chunks.push(String(chunk)));
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { isTTY: false, columns: 20, rows: 5 });
  const stdin = new Readable({ read() {} }) as unknown as NodeJS.ReadStream;
  Object.assign(stdin, { isTTY: false });

  const app = createApp(defineComponent(() => () => h(Text, null, () => "observed")));
  app.mount({
    stdout,
    stderr,
    stdin,
    liveUpdates: true,
    patchConsole: false,
    maxFps: 0,
    [INTERNAL_RENDER_OBSERVER]: observer,
  } as MountOptions);
  await app.waitUntilRenderFlush();
  app.unmount();
  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
  return chunks.join("");
}

test("observing commits does not change the production output path", async () => {
  const frames: InternalContentFrame[] = [];
  const observed = await run({
    onCommit(frame) {
      frames.push(frame);
    },
  });

  expect(frames.some((frame) => frame.dynamic === "observed")).toBe(true);
  expect(observed).toBe(await run());
});
