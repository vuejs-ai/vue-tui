import { expect, test } from "vite-plus/test";
import {
  emitTestEvent as emitFromInternalEntry,
  setTestEventSink,
} from "../../src/internal/testing.ts";
import { emitTestEvent } from "../../src/test-events.ts";

test("shares one ordered emitter across duplicate runtime modules and fixture callers", async () => {
  const lines: string[] = [];
  const duplicate = (await import(
    new URL("../../src/test-events.ts?duplicate-runtime-module", import.meta.url).href
  )) as typeof import("../../src/test-events.ts");
  expect(duplicate.emitTestEvent).not.toBe(emitTestEvent);

  expect(() => emitTestEvent("unconfigured")).not.toThrow();
  expect(lines).toEqual([]);

  setTestEventSink((line) => lines.push(line));
  emitTestEvent("terminal:acquired");
  duplicate.emitTestEvent("paint:committed");
  emitFromInternalEntry("app:mounted", { generation: 1 });

  expect(lines.map((line) => JSON.parse(line))).toEqual([
    { seq: 1, ev: "terminal:acquired" },
    { seq: 2, ev: "paint:committed" },
    { seq: 3, ev: "app:mounted", data: { generation: 1 } },
  ]);

  setTestEventSink(() => {
    throw new Error("closed test event channel");
  });
  expect(() => emitTestEvent("ignored-sink-failure")).not.toThrow();
});
