// This test patches process.stdout, a process-global stream, so it must stay sequential.
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { renderToString, Text } from "@vue-tui/runtime";
import { ScrollBox } from "../index.ts";

test("ScrollBox does not enable mouse mode during renderToString", () => {
  const writes: string[] = [];
  const originalWrite = Reflect.get(process.stdout, "write") as typeof process.stdout.write;
  const originalIsTTY = process.stdout.isTTY;
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
  process.stdout.write = ((chunk: string | Uint8Array) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;

  try {
    const App = defineComponent(() => {
      return () => (
        <ScrollBox>
          <Text>content</Text>
        </ScrollBox>
      );
    });

    expect(renderToString(App)).toContain("content");
    expect(writes).not.toContain("\x1b[?1000h\x1b[?1006h");
    expect(writes).not.toContain("\x1b[?1000l\x1b[?1006l");
  } finally {
    process.stdout.write = originalWrite;
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalIsTTY,
    });
  }
});
