import { describe, expect, test } from "vite-plus/test";
import { captureInternalInputRoutePlan, dispatchInternalInput } from "./input-route-policy.ts";
import { createInternalInputRoutingRuntime } from "./input-route-runtime.ts";
import { normalizeInputEvent } from "./normalized-input.ts";

const continueRoute = () => ({
  performed: false,
  continue: true,
  preventDefault: false,
  blockExternal: false,
});

const continueDefault = () => ({ performed: false, continue: true, blockExternal: false });

const fact = normalizeInputEvent("x")!;

describe("internal live input route activations", () => {
  test("uses selected layer order rather than registration order", () => {
    const calls: string[] = [];
    const runtime = createInternalInputRoutingRuntime();
    const external = runtime.registerExternal({
      id: "external",
      receive: () => calls.push("external"),
    });
    const appDefault = runtime.registerDefault({
      id: "app-default",
      handle: () => (calls.push("app-default"), continueDefault()),
    });
    const ownerDefault = runtime.registerDefault({
      id: "owner-default",
      handle: () => (calls.push("owner-default"), continueDefault()),
    });
    const ancestor = runtime.registerSemantic({
      id: "ancestor",
      handle: () => (calls.push("ancestor"), continueRoute()),
    });
    const owner = runtime.registerSemantic({
      id: "owner",
      handle: () => (calls.push("owner"), continueRoute()),
    });
    const boundary = runtime.registerSemantic({
      id: "boundary",
      handle: () => (calls.push("boundary"), continueRoute()),
    });
    const global = runtime.registerSemantic({
      id: "global",
      handle: () => (calls.push("global"), continueRoute()),
    });

    runtime.select({
      applicationGlobal: [global.lease],
      activeBoundary: boundary.lease,
      focusedOwner: owner.lease,
      logicalAncestors: [ancestor.lease],
      ownerDefaults: [ownerDefault.lease],
      applicationDefaults: [appDefault.lease],
      external: external.lease,
    });
    const resolution = runtime.resolve(runtime.capture());
    dispatchInternalInput(fact, captureInternalInputRoutePlan(resolution.candidate));

    expect(resolution.kind).toBe("selected");
    expect(calls).toEqual([
      "global",
      "boundary",
      "owner",
      "ancestor",
      "owner-default",
      "app-default",
      "external",
    ]);
  });

  test("keeps a resolved plan fixed while replacement receives only later facts", () => {
    const calls: string[] = [];
    const runtime = createInternalInputRoutingRuntime();
    const later = runtime.registerSemantic({
      id: "later",
      handle: () => (calls.push("later"), continueRoute()),
    });
    const first = runtime.registerSemantic({
      id: "first",
      handle: () => {
        calls.push("first");
        later.end();
        return continueRoute();
      },
    });
    runtime.select({ activeBoundary: first.lease, logicalAncestors: [later.lease] });

    const frozen = captureInternalInputRoutePlan(runtime.resolve(runtime.capture()).candidate);
    dispatchInternalInput(fact, frozen);
    expect(calls).toEqual(["first", "later"]);

    const replacement = runtime.registerSemantic({
      id: "replacement",
      handle: () => (calls.push("replacement"), continueRoute()),
    });
    runtime.select({ activeBoundary: replacement.lease });
    dispatchInternalInput(
      fact,
      captureInternalInputRoutePlan(runtime.resolve(runtime.capture()).candidate),
    );
    expect(calls).toEqual(["first", "later", "replacement"]);
  });

  test("fails a stale selected path closed but preserves its independent global", () => {
    const calls: string[] = [];
    const runtime = createInternalInputRoutingRuntime([
      {
        id: "framework-default",
        handle: () => (calls.push("framework-default"), continueDefault()),
      },
    ]);
    const global = runtime.registerSemantic({
      id: "global",
      handle: () => (calls.push("global"), continueRoute()),
    });
    const boundary = runtime.registerSemantic({
      id: "boundary",
      handle: () => (calls.push("boundary"), continueRoute()),
    });
    const external = runtime.registerExternal({
      id: "external",
      receive: () => calls.push("external"),
    });
    runtime.select({
      applicationGlobal: [global.lease],
      activeBoundary: boundary.lease,
      external: external.lease,
    });
    const captured = runtime.capture();
    boundary.end();

    const resolution = runtime.resolve(captured);
    dispatchInternalInput(fact, captureInternalInputRoutePlan(resolution.candidate));

    expect(resolution.kind).toBe("stale");
    expect(calls).toEqual(["global"]);
  });

  test("rejects a lease from another application before replacing selection", () => {
    const first = createInternalInputRoutingRuntime();
    const second = createInternalInputRoutingRuntime();
    const local = first.registerSemantic({ id: "local", handle: continueRoute });
    const foreign = second.registerSemantic({ id: "foreign", handle: continueRoute });
    first.select({ activeBoundary: local.lease });

    expect(() => first.select({ activeBoundary: foreign.lease })).toThrow(
      "Input route lease belongs to a different application",
    );
    expect(first.resolve(first.capture()).candidate.activeBoundary?.id).toBe("local");
  });

  test("rejects an ended lease before replacing selection", () => {
    const runtime = createInternalInputRoutingRuntime();
    const current = runtime.registerSemantic({ id: "current", handle: continueRoute });
    const ended = runtime.registerSemantic({ id: "ended", handle: continueRoute });
    runtime.select({ activeBoundary: current.lease });
    ended.end();

    expect(() => runtime.select({ activeBoundary: ended.lease })).toThrow(
      "Cannot select an ended input route lease",
    );
    expect(runtime.resolve(runtime.capture()).candidate.activeBoundary?.id).toBe("current");
  });
});
