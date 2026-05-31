// Sequential: this test installs a process-global `unhandledRejection` listener
// and asserts on what it captures. Under file-level parallelism a sibling test's
// stray rejection could be counted here (or ours leak there), so it must run
// isolated — mirroring Ink's test.serial for the same scenario. Moved out of the
// file-parallel error-handling.test.tsx per the repo's process-global convention.

import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";

test.sequential("does not emit unhandledRejection when render exits with an error and waitUntilExit is unused", async () => {
  const unhandledErrors: Error[] = [];
  const handler = (reason: unknown) => {
    unhandledErrors.push(reason as Error);
  };
  process.on("unhandledRejection", handler);

  try {
    const Boom = defineComponent(() => {
      throw new Error("no-listener boom");
    });
    await render(Boom).catch(() => {});
    // Give a tick for any stray rejections to surface
    await new Promise((r) => setTimeout(r, 10));
    expect(unhandledErrors).toHaveLength(0);
  } finally {
    process.off("unhandledRejection", handler);
  }
});
