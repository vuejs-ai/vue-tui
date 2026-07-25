import { effectScope } from "vue";
import { describe, expect, test } from "vite-plus/test";
import Yoga from "yoga-layout";
import type { AppContext } from "../context.ts";
import { createBox, createRoot, type TuiBox, type TuiRoot } from "../host/nodes.ts";
import { createInternalFocusController } from "./focus-controller.ts";

function connect(parent: TuiRoot | TuiBox, child: TuiBox): TuiBox {
  child.parent = parent;
  parent.children.push(child);
  return child;
}

function createFixture(inert = false) {
  const root = createRoot({} as AppContext);
  const focus = createInternalFocusController({ root, inert });
  return { root, focus };
}

describe("focus controller", () => {
  test("gives every logical handle one distinct synchronously replaceable identity", () => {
    const { focus } = createFixture();
    const first = focus.createTarget();
    const second = focus.createTarget();

    expect(first.focus()).toBeUndefined();
    expect(first.isFocused.value).toBe(true);
    expect(second.isFocused.value).toBe(false);

    expect(second.focus()).toBeUndefined();
    expect(first.isFocused.value).toBe(false);
    expect(second.isFocused.value).toBe(true);

    expect(first.blur()).toBeUndefined();
    expect(second.isFocused.value).toBe(true);
    expect(second.blur()).toBeUndefined();
    expect(second.isFocused.value).toBe(false);
    focus.dispose();
  });

  test("keeps an unavailable rendered handle inert without disturbing the owner", () => {
    const { root, focus } = createFixture();
    const logical = focus.createTarget();
    const rendered = focus.createTarget({ requiresRenderedTarget: true });
    logical.focus();

    rendered.focus();
    expect(logical.isFocused.value).toBe(true);
    expect(rendered.isFocused.value).toBe(false);

    const host = connect(root, createBox());
    focus.transaction("reconcile", () => {
      focus.attachTarget(rendered, host);
    });
    expect(rendered.isFocused.value).toBe(false);

    rendered.focus();
    expect(logical.isFocused.value).toBe(false);
    expect(rendered.isFocused.value).toBe(true);
    focus.dispose();
  });

  test("preserves ownership across one valid-to-valid rendered reconciliation", () => {
    const { root, focus } = createFixture();
    const first = connect(root, createBox());
    const second = connect(root, createBox());
    const target = focus.createTarget({ requiresRenderedTarget: true });
    let detach = () => {};

    focus.transaction("reconcile", () => {
      detach = focus.attachTarget(target, first);
    });
    target.focus();
    expect(target.isFocused.value).toBe(true);

    focus.transaction("reconcile", () => {
      detach();
      detach = focus.attachTarget(target, second);
    });
    expect(target.isFocused.value).toBe(true);
    focus.dispose();
  });

  test("defers removal invalidation until reconciliation and never restores later", () => {
    const { root, focus } = createFixture();
    const host = connect(root, createBox());
    const target = focus.createTarget({ requiresRenderedTarget: true });
    let detach = () => {};
    focus.transaction("reconcile", () => {
      detach = focus.attachTarget(target, host);
    });
    target.focus();

    focus.transaction("cleanup", () => {
      focus.beforeInvalidateSubtree(host);
      detach();
    });
    expect(target.isFocused.value).toBe(true);

    focus.transaction("reconcile", () => {});
    expect(target.isFocused.value).toBe(false);

    focus.transaction("reconcile", () => {
      focus.attachTarget(target, host);
    });
    expect(target.isFocused.value).toBe(false);
    focus.dispose();
  });

  test("clears rendered focus when its own or an ancestor's display is none", () => {
    const { root, focus } = createFixture();
    const ancestor = connect(root, createBox());
    const host = connect(ancestor, createBox());
    const target = focus.createTarget({ requiresRenderedTarget: true });
    focus.transaction("reconcile", () => {
      focus.attachTarget(target, host);
    });
    target.focus();

    ancestor.yoga = { getDisplay: () => Yoga.DISPLAY_NONE } as TuiBox["yoga"];
    focus.transaction("reconcile", () => {});
    expect(target.isFocused.value).toBe(false);

    ancestor.yoga = { getDisplay: () => Yoga.DISPLAY_FLEX } as TuiBox["yoga"];
    focus.transaction("reconcile", () => {});
    expect(target.isFocused.value).toBe(false);
    focus.dispose();
  });

  test("preserves logical focus when rendered ancestry changes", () => {
    const { root, focus } = createFixture();
    const ancestor = connect(root, createBox());
    const target = focus.createTarget();
    target.focus();

    ancestor.yoga = { getDisplay: () => Yoga.DISPLAY_NONE } as TuiBox["yoga"];
    focus.transaction("reconcile", () => {});
    expect(target.isFocused.value).toBe(true);
    focus.dispose();
  });

  test("publishes false to a retained owner after its creating Vue scope stops", () => {
    const { focus } = createFixture();
    const scope = effectScope();
    const target = scope.run(() => focus.createTarget())!;
    target.focus();
    expect(target.isFocused.value).toBe(true);

    scope.stop();
    focus.removeTarget(target);
    expect(target.isFocused.value).toBe(false);
    expect(target.focus()).toBeUndefined();
    expect(target.isFocused.value).toBe(false);
    focus.dispose();
  });

  test("fails closed when rendered-target reconciliation rolls back", () => {
    const { root, focus } = createFixture();
    const first = connect(root, createBox());
    const second = connect(root, createBox());
    const target = focus.createTarget({ requiresRenderedTarget: true });
    let detach = () => {};
    focus.transaction("reconcile", () => {
      detach = focus.attachTarget(target, first);
    });
    target.focus();
    expect(target.isFocused.value).toBe(true);

    expect(() =>
      focus.transaction("reconcile", () => {
        detach();
        focus.attachTarget(target, second);
        throw new Error("reconciliation failed");
      }),
    ).toThrow("reconciliation failed");
    expect(target.isFocused.value).toBe(false);

    focus.transaction("reconcile", () => {});
    expect(target.isFocused.value).toBe(false);
    focus.dispose();
  });

  test("keeps every operation inert in the string host and after disposal", () => {
    const { focus } = createFixture(true);
    const target = focus.createTarget();
    target.focus();
    expect(target.isFocused.value).toBe(false);

    focus.dispose();
    target.focus();
    target.blur();
    expect(target.isFocused.value).toBe(false);
  });
});
