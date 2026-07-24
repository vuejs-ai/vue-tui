import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Text, renderToString, useStdin, useLayoutSize } from "@vue-tui/runtime";
import { useStderr } from "../../runtime/dist/internal.mjs";
import { useStdout } from "../../runtime/dist/internal.mjs";

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
