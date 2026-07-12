import { describe, expect, test } from "vite-plus/test";
import { createInternalInputRouteRegistry } from "./input-routes.ts";

describe("internal input routes", () => {
  test("a replacement attachment cannot inherit an earlier snapshot", () => {
    const routes = createInternalInputRouteRegistry();
    const calls: string[] = [];
    const detachFirst = routes.attach("paste", () => calls.push("first"));
    const snapshot = routes.snapshot();

    detachFirst();
    routes.attach("paste", () => calls.push("second"));
    routes.emit(snapshot, "paste", "payload");

    expect(routes.had(snapshot, "paste")).toBe(true);
    expect(calls).toEqual([]);
  });

  test("recipient activity is frozen before re-entrant delivery", () => {
    const routes = createInternalInputRouteRegistry();
    const calls: string[] = [];
    let detachSecond = () => {};
    routes.attach("paste", () => {
      calls.push("first");
      detachSecond();
      routes.attach("paste", () => calls.push("third"));
    });
    detachSecond = routes.attach("paste", () => calls.push("second"));

    routes.emit(routes.snapshot(), "paste", "one");
    expect(calls).toEqual(["first", "second"]);

    calls.length = 0;
    routes.emit(routes.snapshot(), "paste", "two");
    expect(calls).toEqual(["first", "third"]);
  });

  test("clear invalidates every captured attachment", () => {
    const routes = createInternalInputRouteRegistry();
    const calls: string[] = [];
    routes.attach("paste", () => calls.push("paste"));
    const snapshot = routes.snapshot();

    routes.clear();
    routes.emit(snapshot, "paste", "payload");

    expect(calls).toEqual([]);
  });
});
