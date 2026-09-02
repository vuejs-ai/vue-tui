import { PassThrough } from "node:stream";
import { defineComponent, h } from "vue";
import { expect, test } from "vite-plus/test";
import { Text, useInput } from "../../src/api/index.ts";
import {
  createManualSuspensionHost,
  INTERNAL_SUSPENSION_HOST,
} from "../../src/terminal/node/process-suspension.ts";
import { createApp, createInternalMountOptions } from "../../src/render.ts";
import { setTestEventSink } from "../../src/api/test-events.ts";

test("reports terminal ownership and accepted paints from the renderer", async () => {
  const events: Array<{ ev: string }> = [];
  setTestEventSink((line) => events.push(JSON.parse(line)));
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdout, { isTTY: true, columns: 80, rows: 24 });
  Object.assign(stderr, { isTTY: false });
  const Root = defineComponent(() => () => h(Text, null, () => "test event frame"));
  const app = createApp(Root);

  app.mount(
    createInternalMountOptions({
      stdin,
      stdout,
      stderr,
      patchConsole: false,
      maxFps: 0,
    }),
  );
  await app.waitUntilRenderFlush();
  app.unmount();
  await app.waitUntilExit();

  const names = events.map(({ ev }) => ev);
  const acquired = names.indexOf("terminal:acquired");
  const painted = names.indexOf("paint:committed");
  const released = names.lastIndexOf("terminal:released");
  expect(acquired).toBeGreaterThanOrEqual(0);
  expect(painted).toBeGreaterThan(acquired);
  expect(released).toBeGreaterThan(painted);

  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});

test("reports continued terminal ownership only after raw input is reacquired", async () => {
  const rawAtAcquisition: boolean[] = [];
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream & {
    isRaw: boolean;
    setRawMode(mode: boolean): NodeJS.ReadStream;
  };
  Object.assign(stdout, { isTTY: true, columns: 80, rows: 24 });
  Object.assign(stderr, { isTTY: false });
  Object.assign(stdin, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: typeof stdin, mode: boolean) {
      this.isRaw = mode;
      return this;
    },
  });
  setTestEventSink((line) => {
    if ((JSON.parse(line) as { ev?: unknown }).ev === "terminal:acquired") {
      rawAtAcquisition.push(stdin.isRaw);
    }
  });
  const suspensionHost = createManualSuspensionHost();
  const Root = defineComponent(() => {
    useInput(() => {});
    return () => h(Text, null, () => "continued input");
  });
  const app = createApp(Root);

  app.mount(
    createInternalMountOptions({
      stdin,
      stdout,
      stderr,
      patchConsole: false,
      maxFps: 0,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    }),
  );
  await app.waitUntilRenderFlush();
  expect(rawAtAcquisition).toEqual([true]);

  await suspensionHost.suspend();
  expect(stdin.isRaw).toBe(false);
  await suspensionHost.resume();
  await app.waitUntilRenderFlush();

  expect(rawAtAcquisition).toEqual([true, true]);
  app.unmount();
  await app.waitUntilExit();
  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});

test("reports fullscreen release when rendering fails after takeover", async () => {
  const events: Array<{ ev: string }> = [];
  setTestEventSink((line) => events.push(JSON.parse(line)));
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdout, { isTTY: true, columns: 80, rows: 24 });
  Object.assign(stderr, { isTTY: false });
  const Root = defineComponent(() => () => h(Text, null, () => "failing fullscreen frame"));
  const app = createApp(Root);

  expect(() =>
    app.mount(
      createInternalMountOptions({
        stdin,
        stdout,
        stderr,
        mode: "fullscreen",
        patchConsole: false,
        maxFps: 0,
        onRender() {
          throw new Error("onRender failed after takeover");
        },
      }),
    ),
  ).toThrow("onRender failed after takeover");
  await expect(app.waitUntilExit()).rejects.toThrow("onRender failed after takeover");

  const names = events.map(({ ev }) => ev);
  expect(names).toContain("terminal:acquired");
  expect(names).toContain("terminal:released");

  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});
