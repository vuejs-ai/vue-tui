import { describe, expect, test } from "vite-plus/test";
import type { TuiText } from "../host/nodes.ts";
import type { TuiMouseClickEvent } from "../mouse/public-events.ts";
import { createStringClipboardService } from "../clipboard/clipboard-service.ts";
import { createInternalTextSelectionController } from "./selection-controller.ts";
import type { InternalTextSelectionTrace } from "./selection-paint.ts";
import type { InternalSelectionSnapshot } from "./selection-policy.ts";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function traced(text: string): {
  readonly trace: InternalTextSelectionTrace;
  readonly snapshot: InternalSelectionSnapshot;
} {
  const boundaries = [0];
  const stops: Array<{ offset: number; x: number; y: number }> = [{ offset: 0, x: 0, y: 0 }];
  const traceCells: InternalTextSelectionTrace["cells"][number][] = [];
  let x = 0;
  for (const [id, part] of [...segmenter.segment(text)].entries()) {
    const start = part.index;
    const end = start + part.segment.length;
    boundaries.push(end);
    traceCells.push({ id, text: part.segment, start, end, x, y: 0, width: 1 });
    x++;
    stops.push({ offset: end, x, y: 0 });
  }
  return {
    trace: { text, boundaries, surfaceOrigin: { x: 0, y: 0 }, stops, cells: traceCells },
    snapshot: {
      text,
      boundaries,
      surfaceOrigin: { x: 0, y: 0 },
      visibleCellIds: new Set(traceCells.map((cell) => cell.id)),
      stops,
      cells: traceCells,
    },
  };
}

describe("text selection paint transaction", () => {
  test("does not create a frame without an active attached owner", () => {
    const clipboard = createStringClipboardService();
    const controller = createInternalTextSelectionController({
      surfaceAvailable: true,
      unavailableReason: "host-unavailable",
      requestPaint() {},
      clipboard,
    });
    const node = { type: "tui-text", parent: null } as unknown as TuiText;

    expect(controller.beginFrame()).toBeUndefined();

    const inactive = controller.register(false);
    inactive.attach(node);
    expect(controller.beginFrame()).toBeUndefined();

    inactive.setActive(true);
    expect(controller.beginFrame()).toBeDefined();

    controller.dispose();
    clipboard.dispose();
  });

  test("publishes only accepted frames and invalidates stale pointer geometry after clear", async () => {
    const clipboard = createStringClipboardService();
    const controller = createInternalTextSelectionController({
      surfaceAvailable: true,
      unavailableReason: "host-unavailable",
      requestPaint() {},
      clipboard,
    });
    const node = { type: "tui-text", parent: null } as unknown as TuiText;
    const registration = controller.register(true);
    registration.attach(node);

    const commit = (text: string): void => {
      const candidate = traced(text);
      const frame = controller.beginFrame()!;
      const target = frame.targetsFor(node)[0]!;
      frame.record(target, candidate.trace);
      frame.prepare(target, candidate.snapshot);
      frame.accept();
    };

    commit("alpha");
    expect(registration.selectAll()).toBe(true);
    commit("alpha");
    expect(registration.state.value).toMatchObject({
      status: "ready",
      text: "alpha",
      selectedText: "alpha",
    });
    await expect(registration.copy()).resolves.toEqual({
      status: "unavailable",
      text: "alpha",
      reason: "string-host",
    });

    const failedCandidate = traced("beta");
    const failed = controller.beginFrame()!;
    const failedTarget = failed.targetsFor(node)[0]!;
    failed.record(failedTarget, failedCandidate.trace);
    failed.prepare(failedTarget, failedCandidate.snapshot);
    failed.discard();
    expect(registration.state.value).toMatchObject({
      status: "ready",
      text: "alpha",
      selectedText: "alpha",
    });

    controller.invalidateSurface();
    expect(registration.state.value).toEqual({
      status: "pending",
      range: null,
      selectedText: "",
    });
    await expect(registration.copy()).resolves.toEqual({ status: "empty" });
    expect(registration.click({} as TuiMouseClickEvent)).toBe("continue");

    commit("alpha!");
    expect(registration.state.value).toMatchObject({
      status: "ready",
      text: "alpha!",
      selectedText: "alpha",
    });

    const staleCandidate = traced("stale");
    const inFlight = controller.beginFrame()!;
    const inFlightTarget = inFlight.targetsFor(node)[0]!;
    inFlight.record(inFlightTarget, staleCandidate.trace);
    inFlight.prepare(inFlightTarget, staleCandidate.snapshot);
    registration.setActive(false);
    inFlight.accept();
    expect(registration.state.value).toEqual({
      status: "inactive",
      range: null,
      selectedText: "",
    });
    registration.setActive(true);
    expect(registration.state.value).toEqual({
      status: "pending",
      range: null,
      selectedText: "",
    });
    commit("fresh");
    expect(registration.state.value).toMatchObject({ status: "ready", text: "fresh" });

    registration.dispose();
    controller.dispose();
    clipboard.dispose();
  });

  test("does not displace a ready pane when another pane cannot select", () => {
    const clipboard = createStringClipboardService();
    const controller = createInternalTextSelectionController({
      surfaceAvailable: true,
      unavailableReason: "host-unavailable",
      requestPaint() {},
      clipboard,
    });
    const firstNode = { type: "tui-text", parent: null } as unknown as TuiText;
    const secondNode = { type: "tui-text", parent: null } as unknown as TuiText;
    const first = controller.register(true);
    first.attach(firstNode);

    const commit = (): void => {
      const candidate = traced("first pane");
      const frame = controller.beginFrame()!;
      const target = frame.targetsFor(firstNode)[0]!;
      frame.record(target, candidate.trace);
      frame.prepare(target, candidate.snapshot);
      frame.accept();
    };
    commit();
    first.selectAll();
    commit();
    expect(first.state.value).toMatchObject({ selectedText: "first pane" });

    const second = controller.register(true);
    second.attach(secondNode);
    expect(second.move("forward", false)).toBe(false);
    expect(second.selectAll()).toBe(false);
    expect(first.state.value).toMatchObject({ selectedText: "first pane" });

    second.dispose();
    first.dispose();
    controller.dispose();
    clipboard.dispose();
  });

  test("rejects two selection registrations for the same Text", () => {
    const clipboard = createStringClipboardService();
    const controller = createInternalTextSelectionController({
      surfaceAvailable: true,
      unavailableReason: "host-unavailable",
      requestPaint() {},
      clipboard,
    });
    const node = { type: "tui-text", parent: null } as unknown as TuiText;
    const first = controller.register(true);
    const detach = first.attach(node);
    const second = controller.register(true);
    expect(() => second.attach(node)).toThrow(
      "useTextSelection() supports one registration per top-level <Text>",
    );
    detach();
    expect(() => second.attach(node)).not.toThrow();

    second.dispose();
    first.dispose();
    controller.dispose();
    clipboard.dispose();
  });

  test("rejects Box and nested virtual Text targets", () => {
    const clipboard = createStringClipboardService();
    const controller = createInternalTextSelectionController({
      surfaceAvailable: true,
      unavailableReason: "host-unavailable",
      requestPaint() {},
      clipboard,
    });
    const registration = controller.register(true);
    for (const type of ["tui-box", "tui-virtual-text"] as const) {
      expect(() => registration.attach({ type } as never)).toThrow(
        "useTextSelection() target must resolve to one top-level <Text>",
      );
    }
    registration.dispose();
    controller.dispose();
    clipboard.dispose();
  });

  test("treats the first shift-click as a real collapsed selection", () => {
    const clipboard = createStringClipboardService();
    const controller = createInternalTextSelectionController({
      surfaceAvailable: true,
      unavailableReason: "host-unavailable",
      requestPaint() {},
      clipboard,
    });
    const node = { type: "tui-text", parent: null } as unknown as TuiText;
    const registration = controller.register(true);
    registration.attach(node);
    const commit = (): void => {
      const candidate = traced("alpha");
      const frame = controller.beginFrame()!;
      const target = frame.targetsFor(node)[0]!;
      frame.record(target, candidate.trace);
      frame.prepare(target, candidate.snapshot);
      frame.accept();
    };
    commit();

    const event: TuiMouseClickEvent = {
      type: "click",
      button: "left",
      delivery: "target",
      surface: { x: 2, y: 0 },
      local: { x: 2, y: 0 },
      modifiers: { shift: true, alt: false, ctrl: false },
    };
    expect(registration.click(event)).toBe("consume");
    commit();
    expect(registration.state.value).toMatchObject({
      status: "ready",
      range: { anchor: 2, extent: 2, collapsed: true },
    });

    registration.dispose();
    controller.dispose();
    clipboard.dispose();
  });
});
