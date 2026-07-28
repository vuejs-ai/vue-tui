import { render, type RenderOptions } from "@vue-tui/testing";
import type { Component } from "vue";

export interface BenchmarkTerminal {
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

export async function mountBenchmarkTerminal(
  component: Component,
  options: RenderOptions,
): Promise<BenchmarkTerminal> {
  const result = await render(component, { ...options, retainFrames: false });
  let disposed = false;

  return Object.freeze({
    flush: () => result.waitUntilRenderFlush(),
    async dispose() {
      if (disposed) return;
      disposed = true;
      result.unmount();
      try {
        await result.waitUntilExit();
      } finally {
        result.dispose();
      }
    },
  });
}
