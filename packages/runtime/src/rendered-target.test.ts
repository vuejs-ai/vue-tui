import { describe, expect, test, vi } from "vite-plus/test";
import type { AppContext } from "./context.ts";
import {
  createBox,
  createRoot,
  type TuiBox,
  type TuiContainer,
  type TuiNode,
} from "./host/nodes.ts";
import { createRenderedTargetController } from "./rendered-target.ts";

function connect(parent: TuiContainer, child: TuiBox): TuiBox {
  child.parent = parent;
  (parent as { children: TuiNode[] }).children.push(child);
  return child;
}

describe("rendered-target controller", () => {
  test("runs every owner transaction around one reconciliation", () => {
    const root = createRoot({} as AppContext);
    const target = connect(root, createBox());
    const events: string[] = [];
    const host = (name: string) => ({
      transaction(_kind: "reconcile" | "cleanup", change: () => void) {
        events.push(`begin:${name}`);
        try {
          change();
        } finally {
          events.push(`commit:${name}`);
        }
      },
      beforeInvalidateSubtree() {
        events.push(`invalidate:${name}`);
      },
    });
    const controller = createRenderedTargetController(root, [host("focus"), host("geometry")]);
    controller.register(
      () => target,
      () => {
        events.push("attach");
        return () => events.push("detach");
      },
    );

    controller.reconcile();
    expect(events).toEqual([
      "begin:focus",
      "begin:geometry",
      "attach",
      "commit:geometry",
      "commit:focus",
    ]);

    events.length = 0;
    controller.invalidateSubtree(target);
    expect(events).toEqual([
      "begin:focus",
      "begin:geometry",
      "invalidate:focus",
      "invalidate:geometry",
      "detach",
      "commit:geometry",
      "commit:focus",
    ]);
  });

  test("invalidates every owner when an earlier owner throws", () => {
    const root = createRoot({} as AppContext);
    const target = connect(root, createBox());
    const boom = new Error("focus invalidation failed");
    let laterInvalidated = false;
    const passthrough = (beforeInvalidateSubtree: () => void) => ({
      transaction(_kind: "reconcile" | "cleanup", change: () => void) {
        change();
      },
      beforeInvalidateSubtree,
    });
    const controller = createRenderedTargetController(root, [
      passthrough(() => {
        throw boom;
      }),
      passthrough(() => {
        laterInvalidated = true;
      }),
    ]);
    controller.register(
      () => target,
      () => () => {},
    );
    controller.reconcile();

    expect(() => controller.invalidateSubtree(target)).toThrow(boom);
    expect(laterInvalidated).toBe(true);
  });

  test("runs one host transaction around a complete retarget reconciliation", () => {
    const root = createRoot({} as AppContext);
    const first = connect(root, createBox());
    const second = connect(root, createBox());
    const events: string[] = [];
    let current: TuiBox | null = first;
    const controller = createRenderedTargetController(root, {
      transaction(kind, change) {
        events.push(`begin:${kind}`);
        try {
          change();
        } finally {
          events.push(`commit:${kind}`);
        }
      },
      beforeInvalidateSubtree() {},
    });
    controller.register(
      () => current,
      (target) => {
        const label = target === first ? "first" : "second";
        events.push(`attach:${label}`);
        return () => events.push(`detach:${label}`);
      },
    );

    controller.reconcile();
    events.length = 0;
    current = second;
    controller.reconcile();

    expect(events).toEqual([
      "begin:reconcile",
      "detach:first",
      "attach:second",
      "commit:reconcile",
    ]);
  });

  test("announces a logically invalidated subtree before any cleanup callback", () => {
    const root = createRoot({} as AppContext);
    const parent = connect(root, createBox());
    const child = connect(parent, createBox());
    const events: string[] = [];
    const controller = createRenderedTargetController(root, {
      transaction(kind, change) {
        events.push(`begin:${kind}`);
        try {
          change();
        } finally {
          events.push(`commit:${kind}`);
        }
      },
      beforeInvalidateSubtree(target) {
        events.push(target === parent ? "invalidate:parent" : "invalidate:other");
      },
    });
    controller.register(
      () => child,
      () => () => {
        events.push("cleanup");
        controller.reconcile();
        events.push("cleanup:reconciled");
      },
    );
    controller.reconcile();
    events.length = 0;

    controller.invalidateSubtree(parent);

    expect(events).toEqual([
      "begin:cleanup",
      "invalidate:parent",
      "cleanup",
      "cleanup:reconciled",
      "commit:cleanup",
    ]);
  });

  test("attaches once, detaches before retargeting, and releases on disposal", () => {
    const root = createRoot({} as AppContext);
    const first = connect(root, createBox());
    const second = connect(root, createBox());
    const events: string[] = [];
    let current: TuiBox | null = null;
    const controller = createRenderedTargetController(root);
    const registration = controller.register(
      () => current,
      (target) => {
        const label = target === first ? "first" : "second";
        events.push(`attach:${label}`);
        return () => events.push(`detach:${label}`);
      },
    );

    controller.reconcile();
    current = first;
    controller.reconcile();
    controller.reconcile();
    current = second;
    controller.reconcile();
    current = null;
    controller.reconcile();
    current = second;
    registration.reconcile();
    registration.dispose();
    registration.dispose();
    current = first;
    controller.reconcile();

    expect(events).toEqual([
      "attach:first",
      "detach:first",
      "attach:second",
      "detach:second",
      "attach:second",
      "detach:second",
    ]);
  });

  test("invalidates a removed subtree before a stale resolver can reattach it", () => {
    const root = createRoot({} as AppContext);
    const parent = connect(root, createBox());
    const child = connect(parent, createBox());
    const replacement = connect(root, createBox());
    const events: string[] = [];
    let current: TuiBox | null = child;
    const controller = createRenderedTargetController(root);
    controller.register(
      () => current,
      (target) => {
        const label = target === child ? "child" : "replacement";
        events.push(`attach:${label}`);
        return () => events.push(`detach:${label}`);
      },
    );

    controller.reconcile();
    controller.invalidateSubtree(parent);
    // Vue 3.4 can leave a component ref pointing at a detached host for the
    // rest of the tick. The invalidation marker rejects it even before nodeOps
    // clears its parent pointer.
    controller.reconcile();
    current = replacement;
    controller.reconcile();

    expect(events).toEqual(["attach:child", "detach:child", "attach:replacement"]);
  });

  test("rejects a node outside the owning render root", () => {
    const root = createRoot({} as AppContext);
    const otherRoot = createRoot({} as AppContext);
    const foreign = connect(otherRoot, createBox());
    const attach = vi.fn();
    const controller = createRenderedTargetController(root);
    controller.register(() => foreign, attach);

    controller.reconcile();

    expect(attach).not.toHaveBeenCalled();
  });

  test("resolves again after cleanup synchronously retargets the registration", () => {
    const root = createRoot({} as AppContext);
    const first = connect(root, createBox());
    const skipped = connect(root, createBox());
    const latest = connect(root, createBox());
    const events: string[] = [];
    let current: TuiBox | null = first;
    const controller = createRenderedTargetController(root);
    controller.register(
      () => current,
      (target) => {
        const label = target === first ? "first" : target === skipped ? "skipped" : "latest";
        events.push(`attach:${label}`);
        return () => {
          events.push(`detach:${label}`);
          if (target === first) current = latest;
        };
      },
    );

    controller.reconcile();
    current = skipped;
    controller.reconcile();

    expect(events).toEqual(["attach:first", "detach:first", "attach:latest"]);
  });

  test("converges when attach synchronously retargets the registration", () => {
    const root = createRoot({} as AppContext);
    const first = connect(root, createBox());
    const second = connect(root, createBox());
    const events: string[] = [];
    let current: TuiBox | null = first;
    const controller = createRenderedTargetController(root);
    controller.register(
      () => current,
      (target) => {
        const label = target === first ? "first" : "second";
        events.push(`attach:${label}`);
        if (target === first) current = second;
        return () => events.push(`detach:${label}`);
      },
    );

    controller.reconcile();

    expect(events).toEqual(["attach:first", "detach:first", "attach:second"]);
  });

  test("invalidates every registration selected before cleanup side effects run", () => {
    const root = createRoot({} as AppContext);
    const parent = connect(root, createBox());
    const first = connect(parent, createBox());
    const second = connect(parent, createBox());
    const events: string[] = [];
    const controller = createRenderedTargetController(root);
    controller.register(
      () => first,
      () => () => {
        events.push("detach:first");
        // A disposer must not be able to move a sibling out of the subtree and
        // thereby prevent the sibling's already-required cleanup.
        second.parent = root;
      },
    );
    controller.register(
      () => second,
      () => () => events.push("detach:second"),
    );
    controller.reconcile();

    controller.invalidateSubtree(parent);

    expect(events).toEqual(["detach:first", "detach:second"]);
  });

  test("continues releasing other registrations when one cleanup throws", () => {
    const root = createRoot({} as AppContext);
    const first = connect(root, createBox());
    const second = connect(root, createBox());
    const cleanupSecond = vi.fn();
    const controller = createRenderedTargetController(root);
    controller.register(
      () => first,
      () => () => {
        throw new Error("cleanup failed");
      },
    );
    controller.register(
      () => second,
      () => cleanupSecond,
    );
    controller.reconcile();

    expect(() => controller.dispose()).toThrow("cleanup failed");
    expect(cleanupSecond).toHaveBeenCalledOnce();
  });
});
