import { nextTick } from "vue";
import type { RenderResult } from "@vue-tui/testing";

export async function flushAcceptedRender(result: RenderResult): Promise<void> {
  await nextTick();
  await result.waitUntilRenderFlush();
}
