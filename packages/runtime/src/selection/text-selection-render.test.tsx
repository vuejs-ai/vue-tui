// TERM is process-global, so the live mouse journey remains in this sequential file.
import { PassThrough, Readable } from "node:stream";
import { defineComponent, h, nextTick, shallowRef, type ComponentPublicInstance } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Text } from "../index.ts";
import { createApp, type MountOptions } from "../render.ts";
import type { TextSelectionCommands } from "./public-selection.ts";
import { useTextSelection } from "../composables/useTextSelection.ts";
import {
  INTERNAL_TEST_INPUT_HOST,
  type InternalTestInputHost,
  type InternalTestMouseEvent,
} from "../io/test-input-host.ts";

function streams() {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { isTTY: true, columns: 8, rows: 5 });
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { isTTY: true, columns: 8, rows: 5 });
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

const modifiers = Object.freeze({ shift: false, alt: false, ctrl: false });

describe("public Fullscreen text selection", () => {
  test("does not republish an unchanged accepted state into the component render loop", async () => {
    const host = streams();
    let renders = 0;
    let selection!: TextSelectionCommands;
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const Root = defineComponent(() => {
      selection = useTextSelection(target, { pointer: false });
      return () => {
        renders++;
        return h(Text, { ref: target }, () => `${selection.state.value.status}:stable`);
      };
    });
    const app = createApp(Root);
    try {
      app.mount({
        ...host,
        mode: "fullscreen",
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
      });
      await nextTick();
      await app.waitUntilRenderFlush();
      expect(selection.state.value.status).toBe("ready");
      const settledRenders = renders;
      await nextTick();
      await app.waitUntilRenderFlush();
      expect(renders).toBe(settledRenders);
    } finally {
      app.unmount();
      host.stdout.destroy();
      host.stderr.destroy();
      host.stdin.destroy();
    }
  });

  test("selects one semantic Text through keyboard and copies exact text", async () => {
    const host = streams();
    const copied: string[] = [];
    let selection!: TextSelectionCommands;
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const Root = defineComponent(() => {
      selection = useTextSelection(target, { pointer: false });
      return () => h(Text, { ref: target }, () => "alpha beta\n你🙂 gamma");
    });
    const app = createApp(Root);
    try {
      app.mount({
        ...host,
        mode: "fullscreen",
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
        clipboard: {
          kind: "custom",
          writeText(text) {
            copied.push(text);
            return { status: "copied" };
          },
        },
      });
      await nextTick();
      await app.waitUntilRenderFlush();
      expect(selection.state.value).toMatchObject({ status: "ready", selectedText: "" });

      expect(selection.selectAll()).toBe(true);
      await app.waitUntilRenderFlush();
      expect(selection.state.value).toMatchObject({
        status: "ready",
        selectedText: "alpha beta\n你🙂 gamma",
      });
      await expect(selection.copy()).resolves.toEqual({
        status: "copied",
        text: "alpha beta\n你🙂 gamma",
      });
      expect(copied).toEqual(["alpha beta\n你🙂 gamma"]);
    } finally {
      app.unmount();
      host.stdout.destroy();
      host.stderr.destroy();
      host.stdin.destroy();
    }
  });

  test("extends a captured F6 drag over wrapped wide text", async () => {
    const previousTerm = process.env.TERM;
    process.env.TERM = "xterm-256color";
    const host = streams();
    let injectMouse!: (event: InternalTestMouseEvent) => void;
    const inputHost: InternalTestInputHost = {
      supportsMouse: true,
      bind(inject) {
        injectMouse = inject;
        return () => {};
      },
      onMouseReportingChange() {},
    };
    let selection!: TextSelectionCommands;
    const target = shallowRef<ComponentPublicInstance | null>(null);
    const Root = defineComponent(() => {
      selection = useTextSelection(target);
      return () => h(Text, { ref: target }, () => "ab你cdefghijkl");
    });
    const app = createApp(Root);
    try {
      app.mount({
        ...host,
        mode: "fullscreen",
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
        [INTERNAL_TEST_INPUT_HOST]: inputHost,
      } as MountOptions);
      await nextTick();
      await app.waitUntilRenderFlush();

      injectMouse({ type: "down", button: "left", x: 1, y: 0, modifiers });
      injectMouse({ type: "drag", button: "left", x: 1, y: 1, modifiers });
      await app.waitUntilRenderFlush();
      expect(selection.state.value).toMatchObject({ selectedText: "b你cdefgh" });
      injectMouse({ type: "drag", button: "left", x: 3, y: 1, modifiers });
      await app.waitUntilRenderFlush();
      injectMouse({ type: "up", button: "left", x: 3, y: 1, modifiers });
      await app.waitUntilRenderFlush();
      expect(selection.state.value).toMatchObject({ status: "ready", selectedText: "b你cdefghij" });
    } finally {
      app.unmount();
      host.stdout.destroy();
      host.stderr.destroy();
      host.stdin.destroy();
      if (previousTerm === undefined) delete process.env.TERM;
      else process.env.TERM = previousTerm;
    }
  });
});
