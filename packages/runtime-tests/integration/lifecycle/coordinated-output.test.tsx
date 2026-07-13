import { PassThrough } from "node:stream";
import { defineComponent, nextTick, onMounted, shallowRef, watch } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Text, createApp, useStderr, useStdout } from "@vue-tui/runtime";

function mountUnthrottled(component: ReturnType<typeof defineComponent>) {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { columns: 100, rows: 100, isTTY: true });
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { columns: 100, rows: 100, isTTY: true });
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    setRawMode() {
      return stdin;
    },
    setEncoding() {
      return stdin;
    },
    ref() {},
    unref() {},
  });

  const stdoutWrites: string[] = [];
  const stderrWrites: string[] = [];
  stdout.on("data", (chunk) => stdoutWrites.push(chunk.toString()));
  stderr.on("data", (chunk) => stderrWrites.push(chunk.toString()));

  const app = createApp(component);
  app.mount({ stdout, stdin, stderr, maxFps: 0 });

  return {
    stdoutWrites,
    stderrWrites,
    unmount: () => app.unmount(),
  };
}

describe("coordinated output", () => {
  test("useStdout().write() does not leak into stderr", async () => {
    const App = defineComponent(() => {
      const { write } = useStdout();

      onMounted(() => {
        write("from stdout hook\n");
      });

      return () => <Text>Hello</Text>;
    });

    const { stdoutWrites, stderrWrites, unmount } = mountUnthrottled(App);
    try {
      await nextTick();
      await nextTick();
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(stdoutWrites.some((write) => write.includes("from stdout hook"))).toBe(true);
      expect(stdoutWrites.some((write) => write.includes("Hello"))).toBe(true);
      expect(stderrWrites.some((write) => write.includes("from stdout hook"))).toBe(false);
      expect(stderrWrites.some((write) => write.includes("Hello"))).toBe(false);
      expect(stderrWrites).not.toContain("");
    } finally {
      unmount();
    }
  });

  test("useStderr().write() replays the latest frame without empty writes", async () => {
    const App = defineComponent(() => {
      const { write } = useStderr();

      onMounted(() => {
        write("from stderr hook\n");
      });

      return () => <Text>Hello</Text>;
    });

    const { stdoutWrites, stderrWrites, unmount } = mountUnthrottled(App);
    try {
      await nextTick();
      await nextTick();
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(stderrWrites.some((write) => write.includes("from stderr hook"))).toBe(true);
      expect(stderrWrites.some((write) => write.includes("Hello"))).toBe(false);
      expect(stdoutWrites.slice(1).some((write) => write.includes("Hello"))).toBe(true);
      expect(stdoutWrites.some((write) => write.includes("from stderr hook"))).toBe(false);
      expect(stdoutWrites).not.toContain("");
      expect(stderrWrites).not.toContain("");
    } finally {
      unmount();
    }
  });

  test("useStdout().write() replays the rerendered frame", async () => {
    const text = shallowRef("Initial");
    let triggerWrite: (() => void) | undefined;

    const App = defineComponent(() => {
      const { write } = useStdout();

      onMounted(() => {
        text.value = "Updated";
      });
      watch(text, (value) => {
        if (value === "Updated") triggerWrite = () => write("from stdout hook\n");
      });

      return () => <Text>{text.value}</Text>;
    });

    const { stdoutWrites, unmount } = mountUnthrottled(App);
    try {
      await nextTick();
      await nextTick();
      await new Promise<void>((resolve) => setImmediate(resolve));

      const beforeExternalWrite = stdoutWrites.length;
      triggerWrite?.();
      await nextTick();

      const writesAfterExternal = stdoutWrites.slice(beforeExternalWrite).join("");
      expect(writesAfterExternal).toContain("from stdout hook");
      expect(writesAfterExternal).toContain("Updated");
      expect(writesAfterExternal).not.toContain("Initial");
      expect(stdoutWrites).not.toContain("");
    } finally {
      unmount();
    }
  });

  test("useStderr().write() replays the rerendered frame", async () => {
    const text = shallowRef("Initial");
    let triggerWrite: (() => void) | undefined;

    const App = defineComponent(() => {
      const { write } = useStderr();

      onMounted(() => {
        text.value = "Updated";
      });
      watch(text, (value) => {
        if (value === "Updated") triggerWrite = () => write("from stderr hook\n");
      });

      return () => <Text>{text.value}</Text>;
    });

    const { stdoutWrites, stderrWrites, unmount } = mountUnthrottled(App);
    try {
      await nextTick();
      await nextTick();
      await new Promise<void>((resolve) => setImmediate(resolve));

      const beforeExternalWrite = stdoutWrites.length;
      triggerWrite?.();
      await nextTick();

      expect(stderrWrites.some((write) => write.includes("from stderr hook"))).toBe(true);
      expect(stderrWrites.some((write) => write.includes("Updated"))).toBe(false);
      expect(stderrWrites.some((write) => write.includes("Initial"))).toBe(false);
      const writesAfterExternal = stdoutWrites.slice(beforeExternalWrite);
      expect(writesAfterExternal.some((write) => write.includes("Updated"))).toBe(true);
      expect(writesAfterExternal.some((write) => write.includes("Initial"))).toBe(false);
      expect(writesAfterExternal.some((write) => write.includes("from stderr hook"))).toBe(false);
      expect(stdoutWrites).not.toContain("");
      expect(stderrWrites).not.toContain("");
    } finally {
      unmount();
    }
  });
});
