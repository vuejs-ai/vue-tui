// TERM is process-global, so this regression lives in a sequential test file.
import { PassThrough, Readable } from "node:stream";
import { defineComponent, h, nextTick, shallowRef, type ShallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { useMouseEvent } from "../composables/use-mouse-event.ts";
import type { ElementTarget } from "../composables/useElementGeometry.ts";
import { INTERNAL_TEST_INPUT_HOST, type InternalTestInputHost } from "../io/test-input-host.ts";
import { createApp, type MountOptions } from "../render.ts";

function streams() {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { isTTY: true, columns: 20, rows: 5 });
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { isTTY: true, columns: 20, rows: 5 });
  const stdin = new Readable({ read() {} }) as unknown as NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, value: boolean) {
      this.isRaw = value;
      return this;
    },
  });
  return { stdout, stderr, stdin };
}

test("a deterministic host supplies its SGR profile to the physical mode owner", async () => {
  const previousTerm = process.env.TERM;
  process.env.TERM = "dumb";
  const host = streams();
  const reporting: Array<"button" | "drag" | undefined> = [];
  const inputHost: InternalTestInputHost = {
    supportsMouse: true,
    bind() {
      return () => {};
    },
    onMouseReportingChange(level) {
      reporting.push(level);
    },
  };
  let target!: ShallowRef<unknown>;
  const Root = defineComponent(() => {
    target = shallowRef<unknown>(null);
    useMouseEvent(target as ElementTarget, "click", () => "continue");
    return () => h("tui-box", { ref: target, width: 6, height: 1 });
  });
  const app = createApp(Root);

  try {
    app.mount({
      ...host,
      patchConsole: false,
      maxFps: 0,
      liveUpdates: true,
      mode: "fullscreen",
      [INTERNAL_TEST_INPUT_HOST]: inputHost,
    } as MountOptions);
    await nextTick();
    await app.waitUntilRenderFlush();
    expect(target.value).not.toBeNull();
    expect(reporting).toEqual(["button"]);
    expect((host.stdin as NodeJS.ReadStream & { isRaw: boolean }).isRaw).toBe(true);

    app.unmount();
    expect(reporting).toEqual(["button", undefined]);
    expect((host.stdin as NodeJS.ReadStream & { isRaw: boolean }).isRaw).toBe(false);
  } finally {
    app.unmount();
    host.stdout.destroy();
    host.stderr.destroy();
    host.stdin.destroy();
    if (previousTerm === undefined) delete process.env.TERM;
    else process.env.TERM = previousTerm;
  }
});
