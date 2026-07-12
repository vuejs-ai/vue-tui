import { describe, expect, test } from "vite-plus/test";
import { watch } from "vue";
import Yoga from "yoga-layout";
import type { AppContext } from "../context.ts";
import {
  createBox,
  createRoot,
  type TuiBox,
  type TuiContainer,
  type TuiNode,
} from "../host/nodes.ts";
import {
  captureInternalInputRoutePlan,
  dispatchInternalInput,
  type InternalInputRouteDecision,
} from "../io/input-route-policy.ts";
import { createInternalInputRoutingRuntime } from "../io/input-route-runtime.ts";
import { normalizeInputEvent } from "../io/normalized-input.ts";
import { createInternalFocusController } from "./focus-controller.ts";

function connect(parent: TuiContainer, child: TuiBox): TuiBox {
  child.parent = parent;
  (parent as { children: TuiNode[] }).children.push(child);
  return child;
}

function makeLayoutNode(node: TuiNode, display: () => number = () => Yoga.DISPLAY_FLEX): void {
  (node as { yoga?: unknown }).yoga = { getDisplay: display };
}

function createTree() {
  const root = createRoot({} as AppContext);
  makeLayoutNode(root);
  return root;
}

const continueRoute = (): InternalInputRouteDecision => ({
  performed: false,
  continue: true,
  preventDefault: false,
  blockExternal: false,
});

const stopRoute = (): InternalInputRouteDecision => ({
  performed: true,
  continue: false,
  preventDefault: false,
  blockExternal: false,
});

function createHarness(options: { failDemand?: () => boolean } = {}) {
  const demand: string[] = [];
  let lease = 0;
  const routing = createInternalInputRoutingRuntime([], {
    acquire() {
      const id = ++lease;
      demand.push(`acquire:${id}`);
      if (options.failDemand?.()) throw new Error("input unavailable");
      return {
        activate() {
          demand.push(`activate:${id}`);
        },
        release() {
          demand.push(`release:${id}`);
        },
      };
    },
  });
  const root = createTree();
  const focus = createInternalFocusController({ root, inputRouting: routing });

  const dispatch = (sequence: string) => {
    const fact = normalizeInputEvent(sequence);
    if (!fact) throw new Error(`expected ${JSON.stringify(sequence)} to normalize`);
    const resolution = routing.resolve(routing.capture());
    return {
      resolution,
      result: dispatchInternalInput(fact, captureInternalInputRoutePlan(resolution.candidate)),
    };
  };

  return { demand, dispatch, focus, root, routing };
}

describe("app-owned focus controller", () => {
  test("does not displace an explicit F3 topology while no focus lifetime exists", () => {
    const routing = createInternalInputRoutingRuntime();
    const manual = routing.registerSemantic({ id: "manual", handle: stopRoute });
    const endManual = routing.select({ focusedOwner: manual.lease });
    const focus = createInternalFocusController({ root: createTree(), inputRouting: routing });

    focus.reconcileRenderedTree();
    expect(routing.resolve(routing.capture())).toMatchObject({
      kind: "selected",
      candidate: { focusedOwner: { id: "manual" } },
    });

    const target = focus.createTarget();
    expect(routing.resolve(routing.capture()).candidate.focusedOwner).toBeUndefined();
    focus.removeTarget(target);
    expect(routing.resolve(routing.capture()).kind).toBe("unselected");

    endManual();
    manual.end();
    focus.dispose();
  });

  test("uses rendered preorder, inherited display:none, and exact public handles", () => {
    const { focus, root } = createHarness();
    let hidden = false;
    const firstHost = connect(root, createBox());
    const secondHost = connect(root, createBox());
    makeLayoutNode(firstHost);
    makeLayoutNode(secondHost, () => (hidden ? Yoga.DISPLAY_NONE : Yoga.DISPLAY_FLEX));
    const first = focus.createTarget({ autoFocus: true });
    const second = focus.createTarget();
    focus.transaction("reconcile", () => {
      focus.attachTarget(first, firstHost);
      focus.attachTarget(second, secondHost);
    });

    expect(focus.focusedTarget.value).toBe(first);
    expect(first.isFocused.value).toBe(true);
    expect(second.isFocused.value).toBe(false);
    expect(focus.focusNext()).toBe(true);
    expect(focus.focusedTarget.value).toBe(second);

    hidden = true;
    focus.reconcileRenderedTree();
    expect(focus.focusedTarget.value).toBe(first);

    hidden = false;
    root.children.splice(0, 2, secondHost, firstHost);
    focus.reconcileRenderedTree();
    expect(focus.focusPrevious()).toBe(true);
    expect(focus.focusedTarget.value).toBe(second);
  });

  test("publishes manager and target refs from one atomic snapshot", () => {
    const { focus, root } = createHarness();
    const firstHost = connect(root, createBox());
    const secondHost = connect(root, createBox());
    makeLayoutNode(firstHost);
    makeLayoutNode(secondHost);
    const first = focus.createTarget({ autoFocus: true });
    const second = focus.createTarget();
    focus.transaction("reconcile", () => {
      focus.attachTarget(first, firstHost);
      focus.attachTarget(second, secondHost);
    });
    const observations: Array<[boolean, boolean, boolean]> = [];
    const observe = () => {
      observations.push([
        focus.focusedTarget.value === second,
        first.isFocused.value,
        second.isFocused.value,
      ]);
    };
    const stops = [
      watch(focus.focusedTarget, observe, { flush: "sync" }),
      watch(first.isFocused, observe, { flush: "sync" }),
      watch(second.isFocused, observe, { flush: "sync" }),
    ];

    focus.focusNext();

    expect(observations.length).toBeGreaterThan(0);
    expect(observations.every((value) => value[0] && !value[1] && value[2])).toBe(true);
    for (const stop of stops) stop();
  });

  test.each([
    {
      label: "attached sequential target",
      attached: true,
      tabIndex: 0 as const,
      hidden: false,
      disabled: false,
      demanded: true,
    },
    {
      label: "detached sequential target",
      attached: false,
      tabIndex: 0 as const,
      hidden: false,
      disabled: false,
      demanded: false,
    },
    {
      label: "programmatic-only target",
      attached: true,
      tabIndex: -1 as const,
      hidden: false,
      disabled: false,
      demanded: false,
    },
    {
      label: "hidden sequential target",
      attached: true,
      tabIndex: 0 as const,
      hidden: true,
      disabled: false,
      demanded: false,
    },
    {
      label: "disabled sequential target",
      attached: true,
      tabIndex: 0 as const,
      hidden: false,
      disabled: true,
      demanded: false,
    },
  ])(
    "derives demand from effective work: $label",
    ({ attached, tabIndex, hidden, disabled, demanded }) => {
      const { demand, focus, root, routing } = createHarness();
      let displayNone = hidden;
      const host = connect(root, createBox());
      makeLayoutNode(host, () => (displayNone ? Yoga.DISPLAY_NONE : Yoga.DISPLAY_FLEX));
      const target = focus.createTarget({ autoFocus: true, tabIndex, disabled });
      if (attached) focus.attachTarget(target, host);

      expect(routing.resolve(routing.capture()).kind).toBe("selected");
      expect(demand.some((event) => event.startsWith("acquire:"))).toBe(demanded);
      displayNone = false;
    },
  );

  test("validates duplicate hosts from the complete transaction and allows an atomic swap", () => {
    const { focus, root } = createHarness();
    const firstHost = connect(root, createBox());
    const secondHost = connect(root, createBox());
    const thirdHost = connect(root, createBox());
    makeLayoutNode(firstHost);
    makeLayoutNode(secondHost);
    makeLayoutNode(thirdHost);
    const first = focus.createTarget({ autoFocus: true });
    const second = focus.createTarget();
    let detachFirst = () => {};
    let detachSecond = () => {};
    focus.transaction("reconcile", () => {
      detachFirst = focus.attachTarget(first, firstHost);
      detachSecond = focus.attachTarget(second, secondHost);
    });

    expect(() =>
      focus.transaction("reconcile", () => {
        detachFirst();
        detachSecond();
        focus.attachTarget(first, secondHost);
        focus.attachTarget(second, firstHost);
      }),
    ).not.toThrow();
    expect(focus.focusedTarget.value).toBe(first);

    const duplicate = focus.createTarget();
    expect(() => focus.attachTarget(duplicate, firstHost)).toThrow("more than one focus target");
    expect(focus.focusedTarget.value).toBe(first);
    expect(() => focus.attachTarget(duplicate, thirdHost)).not.toThrow();
  });

  test("freezes same-node handler membership for the current fact", () => {
    const { dispatch, focus, root } = createHarness();
    const host = connect(root, createBox());
    makeLayoutNode(host);
    const target = focus.createTarget({ autoFocus: true, tabIndex: -1 });
    focus.attachTarget(target, host);
    const calls: string[] = [];
    let disposeSecond = () => {};
    let installedThird = false;
    focus.registerTargetInput(target, () => {
      calls.push("first");
      disposeSecond();
      if (!installedThird) {
        installedThird = true;
        focus.registerTargetInput(target, () => (calls.push("third"), continueRoute()));
      }
      return stopRoute();
    });
    disposeSecond = focus.registerTargetInput(target, () => {
      calls.push("second");
      return continueRoute();
    });

    dispatch("x");
    expect(calls).toEqual(["first", "second"]);

    calls.length = 0;
    dispatch("x");
    expect(calls).toEqual(["first", "third"]);
  });

  test("does not let an old Tab default traverse a scope opened by the same fact", () => {
    const { dispatch, focus, root } = createHarness();
    const composerHost = connect(root, createBox());
    const firstApprovalHost = connect(root, createBox());
    const secondApprovalHost = connect(root, createBox());
    makeLayoutNode(composerHost);
    makeLayoutNode(firstApprovalHost);
    makeLayoutNode(secondApprovalHost);
    const composer = focus.createTarget({ autoFocus: true });
    const modal = focus.createScope({ active: false, trapped: true });
    const firstApproval = focus.createTarget({ scope: modal, autoFocus: true });
    const secondApproval = focus.createTarget({ scope: modal });
    focus.transaction("reconcile", () => {
      focus.attachTarget(composer, composerHost);
      focus.attachTarget(firstApproval, firstApprovalHost);
      focus.attachTarget(secondApproval, secondApprovalHost);
    });
    focus.registerTargetInput(composer, (fact) => {
      if (fact.kind === "key" && fact.key.name === "tab") {
        focus.updateScope(modal, { active: true });
      }
      return continueRoute();
    });

    dispatch("\t");
    expect(focus.focusedTarget.value).toBe(firstApproval);

    dispatch("\t");
    expect(focus.focusedTarget.value).toBe(secondApproval);
  });

  test("keeps a targetless trapped scope selected and demands input only for its handler", () => {
    const { demand, dispatch, focus, routing } = createHarness();
    const modal = focus.createScope({ trapped: true });
    const calls: string[] = [];
    const release = focus.registerScopeInput(modal, () => {
      calls.push("modal");
      return continueRoute();
    });

    expect(routing.resolve(routing.capture()).kind).toBe("selected");
    expect(demand.some((event) => event.startsWith("acquire:"))).toBe(true);
    dispatch("x");
    expect(calls).toEqual(["modal"]);
    expect(modal.containsFocus.value).toBe(false);

    release();
    expect(routing.resolve(routing.capture()).kind).toBe("selected");
    expect(demand.at(-1)?.startsWith("release:")).toBe(true);
  });

  test("does not count an off-path target handler as input demand", () => {
    const { demand, focus, root } = createHarness();
    const firstHost = connect(root, createBox());
    const secondHost = connect(root, createBox());
    makeLayoutNode(firstHost);
    makeLayoutNode(secondHost);
    const first = focus.createTarget({ autoFocus: true, tabIndex: -1 });
    const second = focus.createTarget({ tabIndex: -1 });
    focus.transaction("reconcile", () => {
      focus.attachTarget(first, firstHost);
      focus.attachTarget(second, secondHost);
    });
    focus.registerTargetInput(second, continueRoute);

    expect(demand.some((event) => event.startsWith("acquire:"))).toBe(false);
    expect(second.focus()).toBe(true);
    expect(demand.some((event) => event.startsWith("acquire:"))).toBe(true);
  });

  test("rolls back focus policy, public refs, and the selected route when demand fails", () => {
    let failDemand = false;
    const { demand, focus, root, routing } = createHarness({
      failDemand: () => failDemand,
    });
    const host = connect(root, createBox());
    makeLayoutNode(host);
    const target = focus.createTarget({ autoFocus: true, tabIndex: -1 });
    focus.attachTarget(target, host);
    const accepted = routing.resolve(routing.capture()).candidate;
    expect(focus.focusedTarget.value).toBe(target);

    failDemand = true;
    expect(() => focus.updateTarget(target, { tabIndex: 0 })).toThrow("input unavailable");

    expect(focus.focusedTarget.value).toBe(target);
    expect(routing.resolve(routing.capture()).candidate).toEqual(accepted);
    expect(focus.focusNext()).toBe(false);
    expect(demand.filter((event) => event.startsWith("release:"))).toEqual([]);

    failDemand = false;
    focus.updateTarget(target, { tabIndex: 0 });
    expect(focus.focusNext()).toBe(true);
  });

  test("restores the accepted route when a reentrant later candidate also fails", () => {
    let focus!: ReturnType<typeof createInternalFocusController>;
    let target!: ReturnType<typeof focus.createTarget>;
    let acquireCount = 0;
    let replacementAcquire = 0;
    let reenter = false;
    const releases: number[] = [];
    const calls: string[] = [];
    const routing = createInternalInputRoutingRuntime([], {
      acquire() {
        const id = ++acquireCount;
        if (reenter) {
          replacementAcquire++;
          if (replacementAcquire === 1) {
            focus.registerTargetInput(target, continueRoute);
          } else if (replacementAcquire === 2) {
            throw new Error("second candidate unavailable");
          }
        }
        return { activate() {}, release: () => releases.push(id) };
      },
    });
    const root = createTree();
    const host = connect(root, createBox());
    makeLayoutNode(host);
    focus = createInternalFocusController({ root, inputRouting: routing });
    target = focus.createTarget({ autoFocus: true, tabIndex: -1 });
    focus.attachTarget(target, host);
    focus.registerTargetInput(target, () => (calls.push("accepted"), continueRoute()));
    const accepted = routing.resolve(routing.capture()).candidate;
    expect(acquireCount).toBe(1);

    reenter = true;
    expect(() => focus.updateTarget(target, { autoFocus: false })).toThrow(
      "second candidate unavailable",
    );

    expect(focus.focusedTarget.value).toBe(target);
    expect(routing.resolve(routing.capture()).kind).toBe("selected");
    expect(routing.resolve(routing.capture()).candidate).toEqual(accepted);
    expect(releases).toEqual([2]);
    const fact = normalizeInputEvent("x")!;
    dispatchInternalInput(
      fact,
      captureInternalInputRoutePlan(routing.resolve(routing.capture()).candidate),
    );
    expect(calls).toEqual(["accepted"]);
  });

  test("rejects a second external owner without replacing the first", () => {
    const { dispatch, focus, root } = createHarness();
    const host = connect(root, createBox());
    makeLayoutNode(host);
    const target = focus.createTarget({ autoFocus: true, tabIndex: -1 });
    focus.attachTarget(target, host);
    const sources: string[] = [];
    focus.registerExternal(target, (source) => sources.push(source.sequence));

    expect(() => focus.registerExternal(target, () => {})).toThrow(
      "more than one external input receiver",
    );
    dispatch("x");
    expect(sources).toEqual(["x"]);
  });

  test("invalidates removed generations and disposes retained handles idempotently", () => {
    const { focus, root, routing } = createHarness();
    const firstHost = connect(root, createBox());
    const secondHost = connect(root, createBox());
    makeLayoutNode(firstHost);
    makeLayoutNode(secondHost);
    const first = focus.createTarget({ autoFocus: true });
    const second = focus.createTarget();
    focus.transaction("reconcile", () => {
      focus.attachTarget(first, firstHost);
      focus.attachTarget(second, secondHost);
    });
    focus.registerTargetInput(first, continueRoute);
    const captured = routing.capture();

    focus.removeTarget(first);

    expect(routing.resolve(captured).kind).toBe("stale");
    expect(focus.focusedTarget.value).toBe(second);
    expect(first.isFocused.value).toBe(false);
    expect(first.focus()).toBe(false);
    expect(first.blur()).toBe(false);

    focus.dispose();
    focus.dispose();
    expect(focus.focusedTarget.value).toBeNull();
    expect(second.isFocused.value).toBe(false);
    expect(routing.resolve(routing.capture()).kind).toBe("unselected");
  });

  test("never revives an ended target lifetime when fallback acquisition fails", () => {
    let failDemand = false;
    const { focus, root, routing } = createHarness({ failDemand: () => failDemand });
    const firstHost = connect(root, createBox());
    const secondHost = connect(root, createBox());
    makeLayoutNode(firstHost);
    makeLayoutNode(secondHost);
    const first = focus.createTarget({ autoFocus: true });
    const second = focus.createTarget();
    focus.transaction("reconcile", () => {
      focus.attachTarget(first, firstHost);
      focus.attachTarget(second, secondHost);
    });
    failDemand = true;

    expect(() => focus.removeTarget(first)).toThrow("input unavailable");

    expect(first.isFocused.value).toBe(false);
    expect(first.focus()).toBe(false);
    expect(focus.focusedTarget.value).toBeNull();
    expect(routing.resolve(routing.capture()).kind).toBe("unselected");

    failDemand = false;
    focus.reconcileRenderedTree();
    expect(focus.focusedTarget.value).toBe(second);
    expect(routing.resolve(routing.capture()).kind).toBe("selected");
  });

  test("fails a removed subtree route closed until the authoritative rendered commit", () => {
    const { focus, root, routing } = createHarness();
    const removedParent = connect(root, createBox());
    const removedHost = connect(removedParent, createBox());
    const fallbackHost = connect(root, createBox());
    makeLayoutNode(removedParent);
    makeLayoutNode(removedHost);
    makeLayoutNode(fallbackHost);
    const removed = focus.createTarget({ autoFocus: true });
    const fallback = focus.createTarget();
    focus.transaction("reconcile", () => {
      focus.attachTarget(removed, removedHost);
      focus.attachTarget(fallback, fallbackHost);
    });
    focus.registerTargetInput(removed, continueRoute);
    expect(focus.focusedTarget.value).toBe(removed);

    focus.transaction("cleanup", () => focus.beforeInvalidateSubtree(removedParent));

    expect(routing.resolve(routing.capture()).kind).toBe("unselected");
    expect(focus.focusedTarget.value).toBe(removed);
    expect(removed.isFocused.value).toBe(true);
    expect(removed.focus()).toBe(false);
    expect(focus.focusNext()).toBe(true);
    expect(focus.focusedTarget.value).toBe(removed);

    root.children.splice(root.children.indexOf(removedParent), 1);
    removedParent.parent = null;
    focus.reconcileRenderedTree();

    expect(focus.focusedTarget.value).toBe(fallback);
    expect(routing.resolve(routing.capture()).kind).toBe("selected");
  });

  test("does not invalidate focus for an unrelated removed subtree", () => {
    const { focus, root, routing } = createHarness();
    const focusedHost = connect(root, createBox());
    const unrelated = connect(root, createBox());
    makeLayoutNode(focusedHost);
    makeLayoutNode(unrelated);
    const target = focus.createTarget({ autoFocus: true });
    focus.attachTarget(target, focusedHost);
    const before = routing.resolve(routing.capture()).candidate;

    focus.beforeInvalidateSubtree(unrelated);

    expect(focus.focusedTarget.value).toBe(target);
    expect(routing.resolve(routing.capture()).kind).toBe("selected");
    expect(routing.resolve(routing.capture()).candidate).toEqual(before);
  });

  test("keeps one focused handle stable across subtree invalidation and keyed replacement", () => {
    const { focus, root, routing } = createHarness();
    const oldParent = connect(root, createBox());
    const oldHost = connect(oldParent, createBox());
    makeLayoutNode(oldParent);
    makeLayoutNode(oldHost);
    const target = focus.createTarget({ autoFocus: true });
    focus.attachTarget(target, oldHost);
    const focusChanges: boolean[] = [];
    const stop = watch(target.isFocused, (value) => focusChanges.push(value), { flush: "sync" });

    focus.beforeInvalidateSubtree(oldParent);
    expect(routing.resolve(routing.capture()).kind).toBe("unselected");
    expect(target.isFocused.value).toBe(true);

    root.children.splice(root.children.indexOf(oldParent), 1);
    oldParent.parent = null;
    const replacement = connect(root, createBox());
    makeLayoutNode(replacement);
    focus.attachTarget(target, replacement);

    expect(focus.focusedTarget.value).toBe(target);
    expect(target.isFocused.value).toBe(true);
    expect(focusChanges).toEqual([]);
    expect(routing.resolve(routing.capture()).kind).toBe("selected");
    stop();
  });

  test("keeps string-host focus services fully inert", () => {
    let acquisitions = 0;
    const routing = createInternalInputRoutingRuntime([], {
      acquire() {
        acquisitions++;
        return { activate() {}, release() {} };
      },
    });
    const root = createTree();
    const host = connect(root, createBox());
    makeLayoutNode(host);
    const focus = createInternalFocusController({ root, inputRouting: routing, inert: true });
    const first = focus.createTarget({ autoFocus: true });
    const second = focus.createTarget();
    const scope = focus.createScope({ trapped: true });
    const calls: string[] = [];

    expect(() => {
      focus.attachTarget(first, host);
      focus.attachTarget(second, host);
      focus.registerTargetInput(first, () => (calls.push("target"), continueRoute()));
      focus.registerScopeInput(scope, () => (calls.push("scope"), continueRoute()));
      focus.registerExternal(first, () => calls.push("external"));
    }).not.toThrow();

    expect(first.focus()).toBe(false);
    expect(focus.focusNext()).toBe(false);
    expect(focus.blur()).toBe(false);
    expect(first.isFocused.value).toBe(false);
    expect(scope.containsFocus.value).toBe(false);
    expect(focus.focusedTarget.value).toBeNull();
    expect(routing.resolve(routing.capture()).kind).toBe("unselected");
    expect(acquisitions).toBe(0);
    expect(calls).toEqual([]);
  });
});
