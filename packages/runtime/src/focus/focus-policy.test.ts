import { describe, expect, test } from "vite-plus/test";
import { createInternalFocusPolicy, type InternalFocusTarget } from "./focus-policy.ts";
import {
  captureInternalInputRoutePlan,
  dispatchInternalInput,
  type InternalInputRouteDecision,
  type InternalInputRouteRecipient,
} from "../io/input-route-policy.ts";
import { normalizeInputEvent } from "../io/normalized-input.ts";

const label = (target: InternalFocusTarget | null): string | null => target?.debugLabel ?? null;

describe("internal F4 focus policy experiment", () => {
  test("restores a complete accepted generation after a failed outer transaction", () => {
    const focus = createInternalFocusPolicy();
    const outer = focus.createTarget({ debugLabel: "outer", autoFocus: true });
    const sibling = focus.createTarget({ debugLabel: "sibling" });
    const modal = focus.createScope({ debugLabel: "modal", active: false, trapped: true });
    const approval = focus.createTarget({
      debugLabel: "approval",
      scope: modal,
      autoFocus: true,
    });
    focus.setRenderedOrder([outer, sibling, approval]);
    const acceptedRoute = focus.route();
    const checkpoint = focus.checkpoint();

    focus.updateScope(modal, { active: true });
    focus.removeTarget(outer);
    const transient = focus.createTarget({ debugLabel: "transient" });
    focus.setRenderedOrder([sibling, approval, transient]);
    expect(label(focus.current)).toBe("approval");

    focus.restore(checkpoint);

    expect(focus.current).toBe(outer);
    expect(focus.route()).toEqual(acceptedRoute);
    expect(focus.focus(transient)).toBe(false);
    expect(focus.focusNext()).toBe(true);
    expect(focus.current).toBe(sibling);
  });

  test("rejects a checkpoint from another focus policy", () => {
    const first = createInternalFocusPolicy();
    const second = createInternalFocusPolicy();

    expect(() => second.restore(first.checkpoint())).toThrow(
      "Focus checkpoint belongs to a different policy",
    );
  });

  test("uses current rendered preorder instead of setup registration order", () => {
    const focus = createInternalFocusPolicy();
    const a = focus.createTarget({ debugLabel: "a", autoFocus: true });
    const b = focus.createTarget({ debugLabel: "b" });
    const c = focus.createTarget({ debugLabel: "c" });

    focus.setRenderedOrder([a, b, c]);
    expect(label(focus.current)).toBe("a");

    focus.setRenderedOrder([a, c, b]);
    expect(focus.focusNext()).toBe(true);
    expect(label(focus.current)).toBe("c");
    expect(focus.focusNext()).toBe(true);
    expect(label(focus.current)).toBe("b");
  });

  test("keeps root initial focus explicit while a trapped scope selects a usable owner", () => {
    const focus = createInternalFocusPolicy();
    const first = focus.createTarget({ debugLabel: "first" });
    const second = focus.createTarget({ debugLabel: "second" });
    focus.setRenderedOrder([first, second]);

    expect(focus.current).toBeNull();
    expect(focus.focusNext()).toBe(true);
    expect(label(focus.current)).toBe("first");

    const modal = focus.createScope({ debugLabel: "modal", active: false, trapped: true });
    const modalSecond = focus.createTarget({
      debugLabel: "modal-second",
      scope: modal,
    });
    const modalFirst = focus.createTarget({
      debugLabel: "modal-first",
      scope: modal,
      autoFocus: true,
    });
    focus.setRenderedOrder([first, modalSecond, modalFirst, second]);
    focus.updateScope(modal, { active: true });

    expect(label(focus.current)).toBe("modal-first");
    expect(focus.focus(second)).toBe(false);
    expect(label(focus.current)).toBe("modal-first");
  });

  test("selects a remembered target that renders after its trapped scope reactivates", () => {
    const focus = createInternalFocusPolicy();
    const composer = focus.createTarget({ debugLabel: "composer", autoFocus: true });
    const modal = focus.createScope({ debugLabel: "modal", active: false, trapped: true });
    const approval = focus.createTarget({
      debugLabel: "approval",
      scope: modal,
      autoFocus: true,
    });
    focus.setRenderedOrder([composer, approval]);

    focus.updateScope(modal, { active: true });
    expect(focus.current).toBe(approval);
    focus.updateScope(modal, { active: false });
    expect(focus.current).toBe(composer);

    focus.setRenderedOrder([composer]);
    focus.updateScope(modal, { active: true });
    expect(focus.current).toBeNull();

    focus.setRenderedOrder([composer, approval]);
    expect(focus.current).toBe(approval);
  });

  test("does not let a delayed scope target replace a later explicit selection", () => {
    const focus = createInternalFocusPolicy();
    const delayedScope = focus.createScope({ debugLabel: "delayed" });
    const delayed = focus.createTarget({
      debugLabel: "delayed-target",
      scope: delayedScope,
      autoFocus: true,
    });
    const explicit = focus.createTarget({ debugLabel: "explicit" });
    focus.setRenderedOrder([explicit]);

    focus.updateScope(delayedScope, { active: false });
    focus.updateScope(delayedScope, { active: true });
    expect(focus.current).toBeNull();

    expect(focus.focus(explicit)).toBe(true);
    focus.setRenderedOrder([delayed, explicit]);
    expect(focus.current).toBe(explicit);
  });

  test("skips hidden and disabled targets and rejects programmatic escape around eligibility", () => {
    const focus = createInternalFocusPolicy();
    const a = focus.createTarget({ debugLabel: "a", autoFocus: true });
    const b = focus.createTarget({ debugLabel: "b" });
    const c = focus.createTarget({ debugLabel: "c" });
    focus.setRenderedOrder([a, b, c]);

    focus.updateTarget(a, { hidden: true });
    expect(label(focus.current)).toBe("b");
    focus.updateTarget(b, { disabled: true });
    expect(label(focus.current)).toBe("c");
    expect(focus.focus(a)).toBe(false);
    expect(focus.focus(b)).toBe(false);
    expect(label(focus.current)).toBe("c");

    focus.updateTarget(a, { hidden: false });
    expect(label(focus.current)).toBe("c");
  });

  test("restores a temporarily unavailable sole target only while no later focus won", () => {
    const focus = createInternalFocusPolicy();
    const composer = focus.createTarget({ debugLabel: "composer", autoFocus: true });
    focus.setRenderedOrder([composer]);

    focus.updateTarget(composer, { hidden: true });
    expect(focus.current).toBeNull();
    focus.updateTarget(composer, { hidden: false });
    expect(label(focus.current)).toBe("composer");

    const stop = focus.createTarget({ debugLabel: "stop" });
    focus.setRenderedOrder([composer, stop]);
    focus.updateTarget(composer, { hidden: true });
    expect(label(focus.current)).toBe("stop");
    focus.updateTarget(composer, { hidden: false });
    expect(label(focus.current)).toBe("stop");
  });

  test("an explicit blur cancels pending temporary restoration", () => {
    const focus = createInternalFocusPolicy();
    const composer = focus.createTarget({ debugLabel: "composer", autoFocus: true });
    focus.setRenderedOrder([composer]);

    focus.updateTarget(composer, { hidden: true });
    expect(focus.current).toBeNull();
    expect(focus.blur()).toBe(true);
    focus.updateTarget(composer, { hidden: false });
    expect(focus.current).toBeNull();
  });

  test("ordinary removal chooses the next rendered target, then the previous target", () => {
    const focus = createInternalFocusPolicy();
    const a = focus.createTarget({ debugLabel: "a" });
    const b = focus.createTarget({ debugLabel: "b", autoFocus: true });
    const c = focus.createTarget({ debugLabel: "c" });
    focus.setRenderedOrder([a, b, c]);

    focus.removeTarget(b);
    expect(label(focus.current)).toBe("c");
    focus.removeTarget(c);
    expect(label(focus.current)).toBe("a");
    focus.removeTarget(a);
    expect(focus.current).toBeNull();
    expect(focus.focus(a)).toBe(false);
  });

  test("uses surviving neighbors from the prior rendered order after a compressed removal", () => {
    const focus = createInternalFocusPolicy();
    const a = focus.createTarget({ debugLabel: "a" });
    const b = focus.createTarget({ debugLabel: "b", autoFocus: true });
    const c = focus.createTarget({ debugLabel: "c" });
    const d = focus.createTarget({ debugLabel: "d" });
    focus.setRenderedOrder([a, b, c, d]);

    focus.setRenderedOrder([c, d]);
    expect(label(focus.current)).toBe("c");
  });

  test("preserves the first detached order through later target and scope cleanup", () => {
    const targetFocus = createInternalFocusPolicy();
    const a = targetFocus.createTarget({ debugLabel: "a" });
    const b = targetFocus.createTarget({ debugLabel: "b", autoFocus: true });
    const x = targetFocus.createTarget({ debugLabel: "x" });
    const y = targetFocus.createTarget({ debugLabel: "y" });
    targetFocus.setRenderedOrder([a, b, x, y]);
    targetFocus.batch(() => {
      targetFocus.setRenderedOrder([x, y]);
      targetFocus.removeTarget(b);
    });
    expect(label(targetFocus.current)).toBe("x");

    const scopeFocus = createInternalFocusPolicy();
    const removedScope = scopeFocus.createScope({ debugLabel: "removed-scope" });
    const before = scopeFocus.createTarget({ debugLabel: "before" });
    const removed = scopeFocus.createTarget({
      debugLabel: "removed",
      scope: removedScope,
      autoFocus: true,
    });
    const after = scopeFocus.createTarget({ debugLabel: "after" });
    const tail = scopeFocus.createTarget({ debugLabel: "tail" });
    scopeFocus.setRenderedOrder([before, removed, after, tail]);
    scopeFocus.batch(() => {
      scopeFocus.setRenderedOrder([after, tail]);
      scopeFocus.removeScope(removedScope);
    });
    expect(label(scopeFocus.current)).toBe("after");
  });

  test("does not transfer focus identity to a newly inserted replacement target", () => {
    const focus = createInternalFocusPolicy();
    const a = focus.createTarget({ debugLabel: "a" });
    const b = focus.createTarget({ debugLabel: "b", autoFocus: true });
    const c = focus.createTarget({ debugLabel: "c" });
    const replacement = focus.createTarget({ debugLabel: "replacement" });
    focus.setRenderedOrder([a, b, c]);

    focus.setRenderedOrder([a, replacement, c]);
    expect(label(focus.current)).toBe("c");
  });

  test("a target handle blurs only itself while the manager can blur the current target", () => {
    const focus = createInternalFocusPolicy();
    const a = focus.createTarget({ debugLabel: "a", autoFocus: true });
    const b = focus.createTarget({ debugLabel: "b" });
    focus.setRenderedOrder([a, b]);

    expect(focus.blur(b)).toBe(false);
    expect(label(focus.current)).toBe("a");
    expect(focus.blur(a)).toBe(true);
    expect(focus.current).toBeNull();
    expect(focus.focus(b)).toBe(true);
    expect(focus.blur()).toBe(true);
    expect(focus.current).toBeNull();
  });

  test("consumes autofocus without stealing and treats false-to-true as a new request", () => {
    const focus = createInternalFocusPolicy();
    const a = focus.createTarget({ debugLabel: "a", autoFocus: true });
    const b = focus.createTarget({ debugLabel: "b", tabIndex: -1, autoFocus: true });
    focus.setRenderedOrder([a, b]);

    expect(label(focus.current)).toBe("a");
    expect(focus.blur()).toBe(true);
    focus.setRenderedOrder([a, b]);
    expect(focus.current).toBeNull();

    focus.updateTarget(b, { autoFocus: false });
    focus.updateTarget(b, { autoFocus: true });
    expect(label(focus.current)).toBe("b");
  });

  test("an atomic rendered retarget retains the logical focus handle", () => {
    const focus = createInternalFocusPolicy();
    const stable = focus.createTarget({ debugLabel: "stable", autoFocus: true });
    const other = focus.createTarget({ debugLabel: "other" });
    focus.setRenderedOrder([stable, other]);

    // F2 may detach one host and attach its replacement inside one authoritative
    // reconciliation. F4 sees the final logical handle order, not the transient host gap.
    focus.setRenderedOrder([other, stable]);
    expect(label(focus.current)).toBe("stable");
  });

  test("independent active regions remember their own last focused descendants", () => {
    const focus = createInternalFocusPolicy();
    const regionA = focus.createScope({ debugLabel: "region-a", active: true });
    const regionB = focus.createScope({ debugLabel: "region-b", active: false });
    const a1 = focus.createTarget({ debugLabel: "a1", scope: regionA });
    const a2 = focus.createTarget({ debugLabel: "a2", scope: regionA, autoFocus: true });
    const b1 = focus.createTarget({ debugLabel: "b1", scope: regionB, autoFocus: true });
    const b2 = focus.createTarget({ debugLabel: "b2", scope: regionB });
    focus.setRenderedOrder([a1, a2, b1, b2]);

    expect(label(focus.current)).toBe("a2");
    focus.batch(() => {
      focus.updateScope(regionA, { active: false });
      focus.updateScope(regionB, { active: true });
    });
    expect(label(focus.current)).toBe("b1");
    expect(focus.focus(b2)).toBe(true);

    focus.batch(() => {
      focus.updateScope(regionB, { active: false });
      focus.updateScope(regionA, { active: true });
    });
    expect(label(focus.current)).toBe("a2");

    focus.batch(() => {
      focus.updateScope(regionA, { active: false });
      focus.updateScope(regionB, { active: true });
    });
    expect(label(focus.current)).toBe("b2");
  });

  test("reactivating one region restores its remembered descendant", () => {
    const focus = createInternalFocusPolicy();
    const region = focus.createScope({ debugLabel: "region" });
    const a = focus.createTarget({ debugLabel: "a", scope: region, autoFocus: true });
    const b = focus.createTarget({ debugLabel: "b" });
    focus.setRenderedOrder([a, b]);

    focus.updateScope(region, { active: false });
    expect(label(focus.current)).toBe("b");
    focus.updateScope(region, { active: true });
    expect(label(focus.current)).toBe("a");
  });

  test("nested trapped scopes restore one level at a time and isolate external owners", () => {
    const focus = createInternalFocusPolicy();
    const pane = focus.createTarget({
      debugLabel: "pane",
      autoFocus: true,
      externalOwner: true,
    });
    const modal1 = focus.createScope({ debugLabel: "modal-1", active: false, trapped: true });
    const modal1Target = focus.createTarget({
      debugLabel: "modal-1-target",
      scope: modal1,
      autoFocus: true,
    });
    const modal2 = focus.createScope({
      debugLabel: "modal-2",
      parent: modal1,
      active: false,
      trapped: true,
    });
    const modal2Target = focus.createTarget({
      debugLabel: "modal-2-target",
      scope: modal2,
      autoFocus: true,
    });
    focus.setRenderedOrder([pane, modal1Target, modal2Target]);

    expect(label(focus.route().externalOwner)).toBe("pane");
    focus.updateScope(modal1, { active: true });
    expect(label(focus.current)).toBe("modal-1-target");
    expect(focus.route().externalOwner).toBeNull();
    focus.updateScope(modal2, { active: true });
    expect(label(focus.current)).toBe("modal-2-target");
    expect(focus.route().ancestors).toEqual([]);

    focus.updateScope(modal2, { active: false });
    expect(label(focus.current)).toBe("modal-1-target");
    focus.updateScope(modal1, { active: false });
    expect(label(focus.current)).toBe("pane");
    expect(label(focus.route().externalOwner)).toBe("pane");
  });

  test("closing a trap does not invent root focus without outer memory", () => {
    const focus = createInternalFocusPolicy();
    const a = focus.createTarget({ debugLabel: "a" });
    const b = focus.createTarget({ debugLabel: "b" });
    const modal = focus.createScope({ debugLabel: "modal", active: false, trapped: true });
    const inside = focus.createTarget({
      debugLabel: "inside",
      scope: modal,
      autoFocus: true,
    });
    focus.setRenderedOrder([a, inside, b]);
    expect(focus.current).toBeNull();

    focus.updateScope(modal, { active: true });
    expect(focus.current).toBe(inside);
    focus.updateScope(modal, { active: false });
    expect(focus.current).toBeNull();
  });

  test("atomic reactivation of the current trap preserves its outer restoration anchor", () => {
    const focus = createInternalFocusPolicy();
    const a = focus.createTarget({ debugLabel: "a", autoFocus: true });
    const c = focus.createTarget({ debugLabel: "c" });
    const modal = focus.createScope({ debugLabel: "modal", active: false, trapped: true });
    const inside = focus.createTarget({
      debugLabel: "inside",
      scope: modal,
      autoFocus: true,
    });
    const d = focus.createTarget({ debugLabel: "d" });
    focus.setRenderedOrder([a, c, inside, d]);
    focus.updateScope(modal, { active: true });

    focus.batch(() => {
      focus.updateScope(modal, { active: false });
      focus.updateScope(modal, { active: true });
    });
    focus.removeTarget(a);
    focus.updateScope(modal, { active: false });
    expect(focus.current).toBe(c);
  });

  test("restores the latest active background region after a modal closes", () => {
    const focus = createInternalFocusPolicy();
    const regionA = focus.createScope({ debugLabel: "region-a" });
    const regionB = focus.createScope({ debugLabel: "region-b", active: false });
    const a = focus.createTarget({ debugLabel: "a", scope: regionA, autoFocus: true });
    const b1 = focus.createTarget({ debugLabel: "b1", scope: regionB, autoFocus: true });
    const b2 = focus.createTarget({ debugLabel: "b2", scope: regionB });
    const modal = focus.createScope({ debugLabel: "modal", active: false, trapped: true });
    const approval = focus.createTarget({
      debugLabel: "approval",
      scope: modal,
      autoFocus: true,
    });
    focus.setRenderedOrder([a, b1, b2, approval]);

    focus.batch(() => {
      focus.updateScope(regionA, { active: false });
      focus.updateScope(regionB, { active: true });
    });
    expect(focus.focus(b2)).toBe(true);
    focus.updateScope(modal, { active: true });
    expect(label(focus.current)).toBe("approval");

    // Background application state changes while the modal remains the hard
    // effective boundary. The modal keeps the current fact route, but closing
    // it must restore the latest active region and its own remembered target.
    focus.batch(() => {
      focus.updateScope(regionB, { active: false });
      focus.updateScope(regionA, { active: true });
    });
    focus.batch(() => {
      focus.updateScope(regionA, { active: false });
      focus.updateScope(regionB, { active: true });
    });
    expect(label(focus.current)).toBe("approval");
    focus.updateScope(modal, { active: false });
    expect(label(focus.current)).toBe("b2");
  });

  test("the most recently activated sibling trap wins and restoration remains stacked", () => {
    const focus = createInternalFocusPolicy();
    const root = focus.createTarget({ debugLabel: "root", autoFocus: true });
    const firstScope = focus.createScope({
      debugLabel: "first-scope",
      active: false,
      trapped: true,
    });
    const secondScope = focus.createScope({
      debugLabel: "second-scope",
      active: false,
      trapped: true,
    });
    const first = focus.createTarget({
      debugLabel: "first",
      scope: firstScope,
      autoFocus: true,
    });
    const second = focus.createTarget({
      debugLabel: "second",
      scope: secondScope,
      autoFocus: true,
    });
    focus.setRenderedOrder([root, first, second]);

    focus.updateScope(firstScope, { active: true });
    focus.updateScope(secondScope, { active: true });
    expect(label(focus.current)).toBe("second");
    focus.batch(() => {
      focus.updateScope(firstScope, { active: false });
      focus.updateScope(firstScope, { active: true });
    });
    expect(label(focus.current)).toBe("first");
    focus.updateScope(firstScope, { active: false });
    expect(label(focus.current)).toBe("second");
    focus.updateScope(secondScope, { active: false });
    expect(label(focus.current)).toBe("root");
  });

  test("a removed restoration target falls back inside the restored parent scope", () => {
    const focus = createInternalFocusPolicy();
    const a = focus.createTarget({ debugLabel: "a", autoFocus: true });
    const b = focus.createTarget({ debugLabel: "b" });
    const modal = focus.createScope({ debugLabel: "modal", active: false, trapped: true });
    const approval = focus.createTarget({
      debugLabel: "approval",
      scope: modal,
      autoFocus: true,
    });
    focus.setRenderedOrder([a, b, approval]);
    focus.updateScope(modal, { active: true });
    focus.removeTarget(a);

    expect(label(focus.current)).toBe("approval");
    focus.updateScope(modal, { active: false });
    expect(label(focus.current)).toBe("b");
  });

  test("route ancestry stops at the active trap and mode does not enter the model", () => {
    for (const mode of ["inline", "fullscreen"] as const) {
      const focus = createInternalFocusPolicy();
      const region = focus.createScope({ debugLabel: `${mode}:region` });
      const modal = focus.createScope({
        debugLabel: `${mode}:modal`,
        parent: region,
        trapped: true,
      });
      const owner = focus.createTarget({
        debugLabel: `${mode}:owner`,
        scope: modal,
        autoFocus: true,
      });
      focus.setRenderedOrder([owner]);

      const route = focus.route();
      expect(label(route.owner)).toBe(`${mode}:owner`);
      expect(route.boundary.debugLabel).toBe(`${mode}:modal`);
      expect(route.ancestors).toEqual([]);
      expect(route.externalOwner).toBeNull();
    }
  });

  test("route ancestry includes inner scopes once and excludes the separate trapped boundary", () => {
    const focus = createInternalFocusPolicy();
    const modal = focus.createScope({ debugLabel: "modal", trapped: true });
    const form = focus.createScope({ debugLabel: "form", parent: modal });
    const owner = focus.createTarget({
      debugLabel: "owner",
      scope: form,
      autoFocus: true,
    });
    focus.setRenderedOrder([owner]);

    const route = focus.route();
    expect(route.boundary).toBe(modal);
    expect(route.ancestors.map((scope) => scope.debugLabel)).toEqual(["form"]);
  });

  test("route capture is read-only during an unreconciled batch", () => {
    const focus = createInternalFocusPolicy();
    const a = focus.createTarget({
      debugLabel: "a",
      tabIndex: -1,
      autoFocus: true,
    });
    const b = focus.createTarget({ debugLabel: "b" });
    const modal = focus.createScope({ debugLabel: "modal", active: false, trapped: true });
    focus.setRenderedOrder([a, b]);
    focus.updateScope(modal, { active: true });

    focus.batch(() => {
      focus.updateScope(modal, { active: false });
      expect(focus.route().boundary.debugLabel).toBe("modal");
    });

    expect(label(focus.current)).toBe("a");
  });

  test("imperative focus operations publish only after the outer batch reconciles", () => {
    const focused = createInternalFocusPolicy();
    const outside = focused.createTarget({ debugLabel: "outside", autoFocus: true });
    const modal = focused.createScope({ debugLabel: "modal", active: false, trapped: true });
    const inside = focused.createTarget({
      debugLabel: "inside",
      scope: modal,
      autoFocus: true,
    });
    focused.setRenderedOrder([outside, inside]);
    focused.updateScope(modal, { active: true });
    focused.batch(() => {
      focused.updateScope(modal, { active: false });
      expect(focused.focus(outside)).toBe(true);
      expect(focused.route().boundary).toBe(modal);
      expect(focused.route().owner).toBe(inside);
    });
    expect(focused.route().boundary).toBe(focused.rootScope);
    expect(focused.route().owner).toBe(outside);

    const traversed = createInternalFocusPolicy();
    const a = traversed.createTarget({ debugLabel: "a", autoFocus: true });
    const b = traversed.createTarget({ debugLabel: "b" });
    traversed.setRenderedOrder([a, b]);
    traversed.batch(() => {
      expect(traversed.focusNext()).toBe(true);
      expect(traversed.route().owner).toBe(a);
      expect(traversed.current).toBe(a);
    });
    expect(traversed.route().owner).toBe(b);
    traversed.batch(() => {
      expect(traversed.focusPrevious()).toBe(true);
      expect(traversed.route().owner).toBe(b);
    });
    expect(traversed.route().owner).toBe(a);
    traversed.batch(() => {
      expect(traversed.blur(a)).toBe(true);
      expect(traversed.route().owner).toBe(a);
    });
    expect(traversed.route().owner).toBeNull();
  });

  test("a targetless modal routes its scope handler as the active boundary", () => {
    const focus = createInternalFocusPolicy();
    const composer = focus.createTarget({ debugLabel: "composer", autoFocus: true });
    const modal = focus.createScope({ debugLabel: "modal", active: false, trapped: true });
    focus.setRenderedOrder([composer]);
    focus.updateScope(modal, { active: true });

    const route = focus.route();
    expect(route.owner).toBeNull();
    expect(route.boundary).toBe(modal);
    // The accepted useFocusScopeInput mapping contributes this exact scope at
    // F3's active-boundary position because it is the current trapped scope.
    const boundary: InternalInputRouteRecipient = {
      id: "modal",
      handle() {
        focus.updateScope(modal, { active: false });
        return {
          performed: true,
          continue: false,
          preventDefault: true,
          blockExternal: true,
        };
      },
    };
    const fact = normalizeInputEvent("\u001b");
    if (!fact) throw new Error("expected Escape to normalize");
    const result = dispatchInternalInput(
      fact,
      captureInternalInputRoutePlan({ activeBoundary: boundary }),
    );

    expect(result.trace).toEqual(["active-boundary:modal"]);
    expect(label(focus.current)).toBe("composer");
  });

  test("the fact that opens a modal cannot reach its newly selected owner", () => {
    const focus = createInternalFocusPolicy();
    const composer = focus.createTarget({ debugLabel: "composer", autoFocus: true });
    const approvalScope = focus.createScope({
      debugLabel: "approval-scope",
      active: false,
      trapped: true,
    });
    const approval = focus.createTarget({
      debugLabel: "approval",
      scope: approvalScope,
      autoFocus: true,
    });
    focus.setRenderedOrder([composer, approval]);

    const calls: string[] = [];
    const composerRecipient: InternalInputRouteRecipient = {
      id: "composer",
      handle() {
        calls.push("composer");
        focus.updateScope(approvalScope, { active: true });
        return {
          performed: true,
          continue: true,
          preventDefault: false,
          blockExternal: false,
        };
      },
    };
    const fact = normalizeInputEvent("a");
    if (!fact) throw new Error("expected text to normalize");
    const result = dispatchInternalInput(
      fact,
      captureInternalInputRoutePlan({ focusedOwner: composerRecipient }),
    );

    expect(result.trace).toEqual(["focused-owner:composer"]);
    expect(calls).toEqual(["composer"]);
    expect(label(focus.current)).toBe("approval");
  });

  test("finder item movement stays separate from focus and a nested editor restores the query", () => {
    const focus = createInternalFocusPolicy();
    const query = focus.createTarget({ debugLabel: "query", autoFocus: true });
    const editorScope = focus.createScope({
      debugLabel: "editor-scope",
      active: false,
      trapped: true,
    });
    const editor = focus.createTarget({
      debugLabel: "editor",
      scope: editorScope,
      autoFocus: true,
    });
    focus.setRenderedOrder([query, editor]);
    let activeItem = "first";

    activeItem = "second";
    expect(activeItem).toBe("second");
    expect(label(focus.current)).toBe("query");
    focus.updateScope(editorScope, { active: true });
    expect(label(focus.current)).toBe("editor");
    focus.updateScope(editorScope, { active: false });
    expect(label(focus.current)).toBe("query");
  });

  test("the input fact that closes a modal cannot reach the restored owner", () => {
    const focus = createInternalFocusPolicy();
    const composer = focus.createTarget({ debugLabel: "composer", autoFocus: true });
    const approvalScope = focus.createScope({
      debugLabel: "approval-scope",
      active: false,
      trapped: true,
    });
    const approval = focus.createTarget({
      debugLabel: "approval",
      scope: approvalScope,
      autoFocus: true,
    });
    focus.setRenderedOrder([composer, approval]);
    focus.updateScope(approvalScope, { active: true });

    const calls: string[] = [];
    const recipients = new Map<InternalFocusTarget, InternalInputRouteRecipient>();
    const continueRoute = (): InternalInputRouteDecision => ({
      performed: false,
      continue: true,
      preventDefault: false,
      blockExternal: false,
    });
    recipients.set(composer, {
      id: "composer",
      handle() {
        calls.push("composer");
        return continueRoute();
      },
    });
    recipients.set(approval, {
      id: "approval",
      handle() {
        calls.push("approval");
        focus.updateScope(approvalScope, { active: false });
        return {
          performed: true,
          continue: false,
          preventDefault: true,
          blockExternal: true,
        };
      },
    });

    const capturedRoute = focus.route();
    const capturedPlan = captureInternalInputRoutePlan({
      focusedOwner: recipients.get(capturedRoute.owner!)!,
    });
    const fact = normalizeInputEvent("\r");
    if (!fact) throw new Error("expected Enter to normalize");
    const result = dispatchInternalInput(fact, capturedPlan);

    expect(result.trace).toEqual(["focused-owner:approval"]);
    expect(calls).toEqual(["approval"]);
    expect(label(focus.current)).toBe("composer");
  });
});
