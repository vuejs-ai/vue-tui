import { PassThrough, Readable } from "node:stream";
import { defineComponent, h, nextTick, shallowRef, type ShallowRef } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { createApp } from "../render.ts";
import { createInternalMountOptions } from "../render.ts";
import { createManualSuspensionHost, INTERNAL_SUSPENSION_HOST } from "../process-suspension.ts";
import type { InternalElementGeometry } from "./geometry-service.ts";
import { useInternalElementGeometry } from "./internal-use-element-geometry.ts";

function streams() {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { isTTY: true, columns: 20, rows: 5 });
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { isTTY: true, columns: 20, rows: 5 });
  const stdin = new Readable({ read() {} }) as unknown as NodeJS.ReadStream;
  Object.assign(stdin, { isTTY: true, setRawMode() {} });
  return { stdout, stderr, stdin };
}

describe("live geometry service wiring", () => {
  test("suspension publishes unavailable and continuation repaints before recovery", async () => {
    const host = streams();
    const suspension = createManualSuspensionHost();
    let geometry!: Readonly<ShallowRef<InternalElementGeometry>>;
    const Root = defineComponent(() => {
      const target = shallowRef<unknown>(null);
      geometry = useInternalElementGeometry(target);
      return () => h("tui-box", { ref: target, width: 4, height: 1 });
    });
    const app = createApp(Root);
    app.mount(
      createInternalMountOptions({
        ...host,
        patchConsole: false,
        maxFps: 0,
        liveUpdates: true,
        mode: "fullscreen",
        [INTERNAL_SUSPENSION_HOST]: suspension,
      }),
    );
    await nextTick();
    await app.waitUntilRenderFlush();
    expect(geometry.value.status).toBe("visible");

    await suspension.suspend();
    expect(geometry.value).toEqual({ status: "unavailable" });
    await suspension.resume();
    await app.waitUntilRenderFlush();
    expect(geometry.value.status).toBe("visible");

    app.unmount();
    host.stdout.destroy();
    host.stderr.destroy();
    host.stdin.destroy();
  });

  test("final-output suspension preserves deterministic document geometry", async () => {
    const host = streams();
    const suspension = createManualSuspensionHost();
    let geometry!: Readonly<ShallowRef<InternalElementGeometry>>;
    const Root = defineComponent(() => {
      const target = shallowRef<unknown>(null);
      geometry = useInternalElementGeometry(target);
      return () => h("tui-box", { ref: target, width: 5, height: 1 });
    });
    const app = createApp(Root);
    app.mount(
      createInternalMountOptions({
        ...host,
        patchConsole: false,
        maxFps: 0,
        liveUpdates: false,
        mode: "inline",
        [INTERNAL_SUSPENSION_HOST]: suspension,
      }),
    );
    await nextTick();
    await app.waitUntilRenderFlush();
    expect(geometry.value).toMatchObject({
      status: "visible",
      surface: { x: 0, y: 0, width: 5, height: 1 },
    });

    const beforeSuspension = geometry.value;
    await suspension.suspend();
    expect(geometry.value).toBe(beforeSuspension);
    await suspension.resume();
    expect(geometry.value).toBe(beforeSuspension);

    app.unmount();
    host.stdout.destroy();
    host.stderr.destroy();
    host.stdin.destroy();
  });
});
