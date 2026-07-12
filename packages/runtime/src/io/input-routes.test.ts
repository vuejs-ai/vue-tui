import { describe, expect, test } from "vite-plus/test";
import { createInternalInputRouteRegistry } from "./input-routes.ts";

const event = {
  type: "wheel",
  direction: "up",
  x: 1,
  y: 1,
  shift: false,
  meta: false,
  ctrl: false,
} as const;

describe("internal input routes", () => {
  test("a replacement attachment cannot inherit an earlier snapshot", () => {
    const routes = createInternalInputRouteRegistry();
    const calls: string[] = [];
    const detachFirst = routes.attach("mouse", () => calls.push("first"));
    const snapshot = routes.snapshot();

    detachFirst();
    routes.attach("mouse", () => calls.push("second"));
    routes.emit(snapshot, "mouse", event);

    expect(routes.had(snapshot, "mouse")).toBe(true);
    expect(calls).toEqual([]);
  });

  test("recipient activity is frozen before re-entrant delivery", () => {
    const routes = createInternalInputRouteRegistry();
    const calls: string[] = [];
    let detachSecond = () => {};
    routes.attach("mouse", () => {
      calls.push("first");
      detachSecond();
      routes.attach("mouse", () => calls.push("third"));
    });
    detachSecond = routes.attach("mouse", () => calls.push("second"));

    routes.emit(routes.snapshot(), "mouse", event);
    expect(calls).toEqual(["first", "second"]);

    calls.length = 0;
    routes.emit(routes.snapshot(), "mouse", event);
    expect(calls).toEqual(["first", "third"]);
  });

  test("clear invalidates every captured attachment", () => {
    const routes = createInternalInputRouteRegistry();
    const calls: string[] = [];
    routes.attach("mouse", () => calls.push("mouse"));
    const snapshot = routes.snapshot();

    routes.clear();
    routes.emit(snapshot, "mouse", event);

    expect(calls).toEqual([]);
  });
});
