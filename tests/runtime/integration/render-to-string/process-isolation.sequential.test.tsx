// Sequential: this test temporarily replaces the process stdin/stdout/stderr properties.
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Text, renderToString, useStdin, useLayoutSize } from "@vue-tui/runtime";
import { useStderr } from "../../../../packages/runtime/dist/internal.mjs";
import { useStdout } from "../../../../packages/runtime/dist/internal.mjs";

test.sequential("the string host avoids process terminal streams", () => {
  const originals = {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  };
  const descriptors = {
    stdin: Object.getOwnPropertyDescriptor(process, "stdin"),
    stdout: Object.getOwnPropertyDescriptor(process, "stdout"),
    stderr: Object.getOwnPropertyDescriptor(process, "stderr"),
  };
  const reads = { stdin: 0, stdout: 0, stderr: 0 };

  for (const key of ["stdin", "stdout", "stderr"] as const) {
    Object.defineProperty(process, key, {
      configurable: true,
      enumerable: descriptors[key]?.enumerable ?? true,
      get() {
        reads[key] += 1;
        return originals[key];
      },
    });
  }

  const App = defineComponent(() => {
    useStdin();
    useStdout();
    useStderr();
    const { width, height } = useLayoutSize();
    return () => (
      <Text>{`${width.value}x${height.value === Infinity ? "unbounded" : height.value}`}</Text>
    );
  });

  try {
    expect(renderToString(App, { width: 41, height: Infinity })).toBe("41xunbounded");
    expect(reads).toEqual({ stdin: 0, stdout: 0, stderr: 0 });
  } finally {
    for (const key of ["stdin", "stdout", "stderr"] as const) {
      const descriptor = descriptors[key];
      if (descriptor) Object.defineProperty(process, key, descriptor);
    }
  }
});

test.sequential("explicit automatic color uses process color policy without acquiring stdout", () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, "stdout");
  const originalColorEnvironment = {
    FORCE_COLOR: process.env.FORCE_COLOR,
    NODE_DISABLE_COLORS: process.env.NODE_DISABLE_COLORS,
    NO_COLOR: process.env.NO_COLOR,
  };
  let reads = 0;
  const App = defineComponent(() => () => <Text color="#ff0080">automatic</Text>);
  let output = "";

  try {
    Object.defineProperty(process, "stdout", {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get() {
        reads++;
        return { isTTY: false } as NodeJS.WriteStream;
      },
    });
    process.env.FORCE_COLOR = "3";
    delete process.env.NO_COLOR;
    delete process.env.NODE_DISABLE_COLORS;
    output = renderToString(App, { color: true });
  } finally {
    if (descriptor) Object.defineProperty(process, "stdout", descriptor);
    else Reflect.deleteProperty(process, "stdout");
    for (const [name, value] of Object.entries(originalColorEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  expect(reads).toBe(1);
  expect(output).toBe("\x1b[38;2;255;0;128mautomatic\x1b[39m");
});
