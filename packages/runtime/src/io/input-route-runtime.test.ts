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

const demandLease = (release: () => void, activate: () => void = () => {}) => ({
  activate,
  release,
});

describe("internal live input route activations", () => {
  test("owns independently captured application-global registrations", () => {
    const transitions: string[] = [];
    const calls: string[] = [];
    const runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        transitions.push("acquire");
        return demandLease(() => transitions.push("release"));
      },
    });
    const first = runtime.registerApplicationGlobal({
      id: "first",
      handle: () => (calls.push("first"), continueRoute()),
    });
    const capturedPlan = captureInternalInputRoutePlan(
      runtime.resolve(runtime.capture()).candidate,
    );
    first.end();
    const second = runtime.registerApplicationGlobal({
      id: "second",
      handle: () => (calls.push("second"), continueRoute()),
    });

    dispatchInternalInput(fact, capturedPlan);
    dispatchInternalInput(
      fact,
      captureInternalInputRoutePlan(runtime.resolve(runtime.capture()).candidate),
    );

    expect(calls).toEqual(["first", "second"]);
    expect(transitions).toEqual(["acquire", "release", "acquire"]);
    second.end();
    expect(transitions).toEqual(["acquire", "release", "acquire", "release"]);
  });

  test("does not publish a global registration when input demand acquisition fails", () => {
    const runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        throw new Error("input unavailable");
      },
    });

    expect(() =>
      runtime.registerApplicationGlobal({ id: "global", handle: continueRoute }),
    ).toThrow("input unavailable");
    expect(runtime.resolve(runtime.capture()).candidate.applicationGlobal).toEqual([]);
  });

  test("activates demand only after a global is published and releases after removal", () => {
    const observations: string[] = [];
    let runtime!: ReturnType<typeof createInternalInputRoutingRuntime>;
    runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        observations.push(
          `acquire:${runtime.resolve(runtime.capture()).candidate.applicationGlobal?.length ?? 0}`,
        );
        return demandLease(
          () => {
            observations.push(
              `release:${runtime.resolve(runtime.capture()).candidate.applicationGlobal?.length ?? 0}`,
            );
          },
          () => {
            observations.push(
              `activate:${runtime.resolve(runtime.capture()).candidate.applicationGlobal?.length ?? 0}`,
            );
          },
        );
      },
    });

    const registration = runtime.registerApplicationGlobal({ id: "global", handle: continueRoute });
    registration.end();

    expect(observations).toEqual(["acquire:0", "activate:1", "release:0"]);
  });

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
    runtime.registerApplicationGlobal({
      id: "global",
      handle: () => (calls.push("global"), continueRoute()),
    });

    runtime.select({
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
    runtime.registerApplicationGlobal({
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

  test("owns one input-demand lease per selected generation", () => {
    const transitions: string[] = [];
    let nextDemand = 0;
    const runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        const demand = ++nextDemand;
        transitions.push(`acquire:${demand}`);
        let released = false;
        return demandLease(() => {
          if (released) return;
          released = true;
          transitions.push(`release:${demand}`);
        });
      },
    });
    const first = runtime.registerSemantic({ id: "first", handle: continueRoute });
    const second = runtime.registerSemantic({ id: "second", handle: continueRoute });

    expect(transitions).toEqual([]);
    const endFirst = runtime.select({ activeBoundary: first.lease });
    const endSecond = runtime.select({ activeBoundary: second.lease });
    expect(transitions).toEqual(["acquire:1", "acquire:2", "release:1"]);

    endFirst();
    expect(transitions).toEqual(["acquire:1", "acquire:2", "release:1"]);
    endSecond();
    expect(transitions).toEqual(["acquire:1", "acquire:2", "release:1", "release:2"]);

    const third = runtime.registerSemantic({ id: "third", handle: continueRoute });
    runtime.select({ activeBoundary: third.lease });
    third.end();
    expect(runtime.resolve(runtime.capture()).kind).toBe("stale");
    expect(transitions).toEqual([
      "acquire:1",
      "acquire:2",
      "release:1",
      "release:2",
      "acquire:3",
      "release:3",
    ]);
    runtime.clear();
    expect(transitions.at(-1)).toBe("release:3");
  });

  test("publishes a selected topology without acquiring input demand", () => {
    const transitions: string[] = [];
    const calls: string[] = [];
    const runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        transitions.push("acquire");
        return demandLease(() => transitions.push("release"));
      },
    });
    const boundary = runtime.registerSemantic({
      id: "boundary",
      handle: () => (calls.push("boundary"), continueRoute()),
    });

    runtime.select({ activeBoundary: boundary.lease }, { inputDemand: false });
    const resolution = runtime.resolve(runtime.capture());
    dispatchInternalInput(fact, captureInternalInputRoutePlan(resolution.candidate));

    expect(resolution.kind).toBe("selected");
    expect(calls).toEqual(["boundary"]);
    expect(transitions).toEqual([]);
  });

  test("lets independent global demand drive a no-demand selected topology", () => {
    const transitions: string[] = [];
    const calls: string[] = [];
    const runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        transitions.push("acquire");
        return demandLease(() => transitions.push("release"));
      },
    });
    const global = runtime.registerApplicationGlobal({
      id: "global",
      handle: () => (calls.push("global"), continueRoute()),
    });
    const boundary = runtime.registerSemantic({
      id: "boundary",
      handle: () => (calls.push("boundary"), continueRoute()),
    });
    const endSelection = runtime.select({ activeBoundary: boundary.lease }, { inputDemand: false });

    dispatchInternalInput(
      fact,
      captureInternalInputRoutePlan(runtime.resolve(runtime.capture()).candidate),
    );

    expect(calls).toEqual(["global", "boundary"]);
    expect(transitions).toEqual(["acquire"]);
    endSelection();
    expect(transitions).toEqual(["acquire"]);
    global.end();
    expect(transitions).toEqual(["acquire", "release"]);
  });

  test("keeps a no-demand logical selection when demand acquisition for its replacement fails", () => {
    const runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        throw new Error("input unavailable");
      },
    });
    const current = runtime.registerSemantic({ id: "current", handle: continueRoute });
    const replacement = runtime.registerSemantic({ id: "replacement", handle: continueRoute });
    runtime.select({ activeBoundary: current.lease }, { inputDemand: false });

    expect(() => runtime.select({ activeBoundary: replacement.lease })).toThrow(
      "input unavailable",
    );
    expect(runtime.resolve(runtime.capture()).candidate.activeBoundary?.id).toBe("current");
  });

  test("replaces a demanded selection with a logical-only selection before releasing demand", () => {
    const observations: string[] = [];
    let runtime!: ReturnType<typeof createInternalInputRoutingRuntime>;
    runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        observations.push("acquire");
        return demandLease(() => {
          observations.push(
            `release:${runtime.resolve(runtime.capture()).candidate.activeBoundary?.id ?? "none"}`,
          );
        });
      },
    });
    const first = runtime.registerSemantic({ id: "first", handle: continueRoute });
    const second = runtime.registerSemantic({ id: "second", handle: continueRoute });
    runtime.select({ activeBoundary: first.lease });

    runtime.select({ activeBoundary: second.lease }, { inputDemand: false });

    expect(runtime.resolve(runtime.capture()).candidate.activeBoundary?.id).toBe("second");
    expect(observations).toEqual(["acquire", "release:second"]);
  });

  test("keeps the previous selection when replacement demand acquisition fails", () => {
    let failNext = false;
    const transitions: string[] = [];
    const runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        transitions.push("acquire");
        if (failNext) throw new Error("input unavailable");
        return demandLease(() => transitions.push("release"));
      },
    });
    const current = runtime.registerSemantic({ id: "current", handle: continueRoute });
    const replacement = runtime.registerSemantic({ id: "replacement", handle: continueRoute });
    runtime.select({ activeBoundary: current.lease });

    failNext = true;
    expect(() => runtime.select({ activeBoundary: replacement.lease })).toThrow(
      "input unavailable",
    );
    expect(runtime.resolve(runtime.capture()).candidate.activeBoundary?.id).toBe("current");
    expect(transitions).toEqual(["acquire", "acquire"]);
  });

  test("keeps input demand for independent globals after the selected path becomes stale", () => {
    const transitions: string[] = [];
    const runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        transitions.push("acquire");
        return demandLease(() => transitions.push("release"));
      },
    });
    const global = runtime.registerApplicationGlobal({ id: "global", handle: continueRoute });
    const boundary = runtime.registerSemantic({ id: "boundary", handle: continueRoute });
    runtime.select({ activeBoundary: boundary.lease });

    boundary.end();
    expect(runtime.resolve(runtime.capture()).kind).toBe("stale");
    expect(runtime.resolve(runtime.capture()).candidate.applicationGlobal?.[0]?.id).toBe("global");
    expect(transitions).toEqual(["acquire", "acquire", "release"]);

    global.end();
    expect(transitions).toEqual(["acquire", "acquire", "release", "release"]);
  });

  test("lets a selection made re-entrantly during acquisition win", () => {
    const held = new Set<number>();
    let nextDemand = 0;
    let reenter = false;
    let runtime!: ReturnType<typeof createInternalInputRoutingRuntime>;
    let nested!: ReturnType<typeof runtime.registerSemantic>;
    runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        const demand = ++nextDemand;
        held.add(demand);
        if (reenter) {
          reenter = false;
          runtime.select({ activeBoundary: nested.lease });
        }
        return demandLease(() => held.delete(demand));
      },
    });
    const current = runtime.registerSemantic({ id: "current", handle: continueRoute });
    const outer = runtime.registerSemantic({ id: "outer", handle: continueRoute });
    nested = runtime.registerSemantic({ id: "nested", handle: continueRoute });
    runtime.select({ activeBoundary: current.lease });

    reenter = true;
    const endSupersededOuter = runtime.select({ activeBoundary: outer.lease });
    expect(endSupersededOuter.accepted).toBe(false);
    expect(runtime.resolve(runtime.capture()).candidate.activeBoundary?.id).toBe("nested");
    expect(held.size).toBe(1);
    endSupersededOuter();
    expect(runtime.resolve(runtime.capture()).candidate.activeBoundary?.id).toBe("nested");
  });

  test("keeps the accepted selection when the caller candidate changes during acquisition", () => {
    const transitions: string[] = [];
    let current = true;
    const runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        transitions.push("acquire");
        current = false;
        return demandLease(() => transitions.push("release"));
      },
    });
    const accepted = runtime.registerSemantic({ id: "accepted", handle: continueRoute });
    const replacement = runtime.registerSemantic({ id: "replacement", handle: continueRoute });
    runtime.select({ activeBoundary: accepted.lease }, { inputDemand: false });

    const endReplacement = runtime.select(
      { activeBoundary: replacement.lease },
      { isCurrent: () => current },
    );

    expect(endReplacement.accepted).toBe(false);
    expect(runtime.resolve(runtime.capture()).candidate.activeBoundary?.id).toBe("accepted");
    expect(transitions).toEqual(["acquire", "release"]);
  });

  test("releases candidate demand when caller revalidation throws", () => {
    const transitions: string[] = [];
    const runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        transitions.push("acquire");
        return demandLease(() => transitions.push("release"));
      },
    });
    const accepted = runtime.registerSemantic({ id: "accepted", handle: continueRoute });
    const replacement = runtime.registerSemantic({ id: "replacement", handle: continueRoute });
    runtime.select({ activeBoundary: accepted.lease }, { inputDemand: false });

    expect(() =>
      runtime.select(
        { activeBoundary: replacement.lease },
        {
          isCurrent() {
            throw new Error("candidate validation failed");
          },
        },
      ),
    ).toThrow("candidate validation failed");

    expect(runtime.resolve(runtime.capture()).candidate.activeBoundary?.id).toBe("accepted");
    expect(transitions).toEqual(["acquire", "release"]);
  });

  test("does not let a hostile demand release interrupt replacement or clear", () => {
    const runtime = createInternalInputRoutingRuntime([], {
      acquire() {
        return demandLease(() => {
          throw new Error("release failed");
        });
      },
    });
    const first = runtime.registerSemantic({ id: "first", handle: continueRoute });
    const second = runtime.registerSemantic({ id: "second", handle: continueRoute });
    runtime.select({ activeBoundary: first.lease });

    let endSecond!: () => void;
    expect(() => {
      endSecond = runtime.select({ activeBoundary: second.lease });
    }).not.toThrow();
    expect(runtime.resolve(runtime.capture()).candidate.activeBoundary?.id).toBe("second");
    expect(endSecond).not.toThrow();
    const third = runtime.registerSemantic({ id: "third", handle: continueRoute });
    runtime.select({ activeBoundary: third.lease });
    expect(() => runtime.clear()).not.toThrow();
  });
});
