import { Buffer } from "node:buffer";
import { defineComponent, h, nextTick } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import {
  createApp,
  renderToString,
  Text,
  useClipboard,
  type UseClipboardReturn,
} from "@vue-tui/runtime";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "../lifecycle/test-streams.ts";

describe("useClipboard public host contract", () => {
  test("models exact custom transport results without system clipboard side effects", async () => {
    let clipboard!: UseClipboardReturn;
    const App = defineComponent(() => {
      clipboard = useClipboard();
      return () => h(Text, null, () => "clipboard");
    });
    const result = await render(App, {
      host: {
        mode: "fullscreen",
        stdout: "stream",
        stdin: "non-tty",
        updates: "live",
        clipboard: "copied",
      },
    });
    try {
      expect(clipboard.availability.value).toEqual({
        status: "available",
        transport: "custom",
      });
      await expect(clipboard.writeText("exact\n你🙂")).resolves.toEqual({
        status: "copied",
        text: "exact\n你🙂",
      });
      expect(result.clipboard.requests).toEqual(["exact\n你🙂"]);

      await result.terminal.suspend();
      expect(clipboard.availability.value).toEqual({
        status: "unavailable",
        reason: "suspended",
      });
      await expect(clipboard.writeText("paused")).resolves.toEqual({
        status: "unavailable",
        text: "paused",
        reason: "suspended",
      });
      await result.terminal.resume();
      expect(clipboard.availability.value).toEqual({
        status: "available",
        transport: "custom",
      });
    } finally {
      result.unmount();
    }
    expect(clipboard.availability.value).toEqual({ status: "unavailable", reason: "disposed" });
    await expect(clipboard.writeText("late")).resolves.toEqual({
      status: "unavailable",
      text: "late",
      reason: "disposed",
    });
    result.dispose();
  });

  test("reports unconfigured and string hosts honestly", async () => {
    let liveClipboard!: UseClipboardReturn;
    const Live = defineComponent(() => {
      liveClipboard = useClipboard();
      return () => h(Text, null, () => "none");
    });
    const live = await render(Live, { host: { mode: "fullscreen" } });
    try {
      expect(liveClipboard.availability.value).toEqual({
        status: "unavailable",
        reason: "not-configured",
      });
      await expect(liveClipboard.writeText("fallback")).resolves.toEqual({
        status: "unavailable",
        text: "fallback",
        reason: "not-configured",
      });
    } finally {
      live.dispose();
    }

    let stringClipboard!: UseClipboardReturn;
    let renderAvailability!: UseClipboardReturn["availability"]["value"];
    let renderWrite!: ReturnType<UseClipboardReturn["writeText"]>;
    const Document = defineComponent(() => {
      stringClipboard = useClipboard();
      renderAvailability = stringClipboard.availability.value;
      renderWrite = stringClipboard.writeText("document");
      return () => h(Text, null, () => "document");
    });
    expect(renderToString(Document)).toContain("document");
    expect(renderAvailability).toEqual({ status: "unavailable", reason: "string-host" });
    await expect(renderWrite).resolves.toEqual({
      status: "unavailable",
      text: "document",
      reason: "string-host",
    });
    expect(stringClipboard.availability.value).toEqual({
      status: "unavailable",
      reason: "disposed",
    });
  });

  test("emits exact OSC 52 bytes and never overstates terminal acceptance", async () => {
    const stdout = makeFakeWritable({ columns: 20, rows: 4 });
    const stderr = makeFakeWritable({ columns: 20, rows: 4 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);
    let clipboard!: UseClipboardReturn;
    const App = defineComponent(() => {
      clipboard = useClipboard();
      return () => h(Text, null, () => "osc52");
    });
    const app = createApp(App);
    try {
      app.mount({
        stdout,
        stderr,
        stdin,
        mode: "fullscreen",
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
        clipboard: { kind: "osc52" },
      });
      await nextTick();
      await app.waitUntilRenderFlush();
      expect(clipboard.availability.value).toEqual({
        status: "available",
        transport: "osc52",
      });

      const text = "copy\n你🙂";
      await expect(clipboard.writeText(text)).resolves.toEqual({ status: "requested", text });
      const payload = Buffer.from(text, "utf8").toString("base64");
      expect(writes.join("")).toContain(`\x1b]52;c;${payload}\x07`);
    } finally {
      app.unmount();
      stdout.destroy();
      stderr.destroy();
      stdin.destroy();
    }
  });

  test("refuses OSC 52 on a non-terminal output", async () => {
    const stdout = makeFakeWritable();
    const stderr = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    stdout.isTTY = false;
    stderr.isTTY = false;
    let clipboard!: UseClipboardReturn;
    const App = defineComponent(() => {
      clipboard = useClipboard();
      return () => h(Text, null, () => "stream");
    });
    const app = createApp(App);
    try {
      app.mount({
        stdout,
        stderr,
        stdin,
        mode: "fullscreen",
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
        clipboard: { kind: "osc52" },
      });
      await nextTick();
      expect(clipboard.availability.value).toEqual({
        status: "unavailable",
        reason: "output-not-terminal",
      });
      await expect(clipboard.writeText("manual")).resolves.toEqual({
        status: "unavailable",
        text: "manual",
        reason: "output-not-terminal",
      });
    } finally {
      app.unmount();
      stdout.destroy();
      stderr.destroy();
      stdin.destroy();
    }
  });
});
