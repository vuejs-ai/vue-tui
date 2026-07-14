import { defineComponent } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Text, useClipboard, type UseClipboardReturn } from "@vue-tui/runtime";
import { render, type TestClipboardBehavior } from "../src/index.ts";

describe("deterministic clipboard host", () => {
  test.each(["copied", "requested", "unavailable", "rejected"] as const)(
    "models %s without touching an ambient system clipboard",
    async (behavior: TestClipboardBehavior) => {
      let clipboard!: UseClipboardReturn;
      const App = defineComponent(() => {
        clipboard = useClipboard();
        return () => <Text>clipboard</Text>;
      });
      const result = await render(App, { host: { clipboard: behavior } });
      try {
        const first = await clipboard.writeText("first\n你🙂");
        const second = await clipboard.writeText("second");
        expect(result.clipboard.requests).toEqual(["first\n你🙂", "second"]);
        expect(first).toMatchObject({
          status: behavior === "unavailable" ? "unavailable" : behavior,
          text: "first\n你🙂",
        });
        expect(second).toMatchObject({
          status: behavior === "unavailable" ? "unavailable" : behavior,
          text: "second",
        });
        if (behavior === "unavailable") {
          expect(first).toMatchObject({
            reason: "transport-unavailable",
            detail: "modeled unavailable",
          });
        }
        if (behavior === "rejected") {
          expect(first).toMatchObject({ cause: expect.any(Error) });
        }
      } finally {
        result.dispose();
      }
    },
  );

  test("tracks suspension and disposal without recording rejected host calls", async () => {
    let clipboard!: UseClipboardReturn;
    const App = defineComponent(() => {
      clipboard = useClipboard();
      return () => <Text>lifecycle</Text>;
    });
    const result = await render(App, { host: { clipboard: "copied" } });
    await result.terminal.suspend();
    await expect(clipboard.writeText("paused")).resolves.toEqual({
      status: "unavailable",
      text: "paused",
      reason: "suspended",
    });
    expect(result.clipboard.requests).toEqual([]);
    await result.terminal.resume();
    await expect(clipboard.writeText("resumed")).resolves.toEqual({
      status: "copied",
      text: "resumed",
    });
    expect(result.clipboard.requests).toEqual(["resumed"]);
    result.unmount();
    await expect(clipboard.writeText("disposed")).resolves.toEqual({
      status: "unavailable",
      text: "disposed",
      reason: "disposed",
    });
    expect(result.clipboard.requests).toEqual(["resumed"]);
    result.dispose();
  });
});
