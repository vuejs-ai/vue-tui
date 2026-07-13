import { expect, test } from "vite-plus/test";
import type { InternalTestMouseEvent } from "@vue-tui/runtime/internal";
import { createTestMouse } from "../src/mouse.ts";

function setup() {
  const events: InternalTestMouseEvent[] = [];
  let flushes = 0;
  const controller = createTestMouse({
    columns: () => 10,
    rows: () => 3,
    assertCanEmit() {},
    async flush() {
      flushes++;
    },
  });
  const detach = controller.host.bind((event) => events.push(event));
  return { controller, detach, events, flushes: () => flushes };
}

test("driver emits zero-based parsed physical facts and flushes each one", async () => {
  const { controller, events, flushes } = setup();
  controller.host.onMouseReportingChange("button");

  await controller.mouse.down({ x: 0, y: 2 });
  await controller.mouse.up({ x: 0, y: 2 }, { button: "right", alt: true });
  await controller.mouse.wheel({ x: 9, y: 0 }, "right", { shift: true, ctrl: true });

  expect(events).toEqual([
    {
      type: "down",
      x: 0,
      y: 2,
      button: "left",
      modifiers: { shift: false, alt: false, ctrl: false },
    },
    {
      type: "up",
      x: 0,
      y: 2,
      button: "right",
      modifiers: { shift: false, alt: true, ctrl: false },
    },
    {
      type: "wheel",
      x: 9,
      y: 0,
      direction: "right",
      modifiers: { shift: true, alt: false, ctrl: true },
    },
  ]);
  expect(flushes()).toBe(3);
});

test("reporting maps runtime drag ownership and clears unmatched left down", async () => {
  const { controller, events } = setup();
  controller.host.onMouseReportingChange("drag");
  controller.host.onMouseReportingChange("drag");
  expect(controller.mouse.reporting.current).toBe("button-motion");
  expect(controller.mouse.reporting.history).toEqual(["button-motion"]);

  await expect(controller.mouse.move({ x: 1, y: 1 })).rejects.toThrow(
    "requires an unmatched left-button down",
  );
  await controller.mouse.down({ x: 1, y: 1 });
  await controller.mouse.move({ x: 2, y: 1 });
  expect(events.at(-1)).toEqual({
    type: "drag",
    x: 2,
    y: 1,
    button: "left",
    modifiers: { shift: false, alt: false, ctrl: false },
  });

  controller.clearPressedButtons();
  await expect(controller.mouse.move({ x: 3, y: 1 })).rejects.toThrow(
    "requires an unmatched left-button down",
  );
  controller.host.onMouseReportingChange(undefined);
  expect(controller.mouse.reporting.current).toBe("none");
  expect(controller.mouse.reporting.history).toEqual(["button-motion", "none"]);
});

test("driver validates one point snapshot against the current modeled surface", async () => {
  const { controller } = setup();
  controller.host.onMouseReportingChange("button");

  await expect(controller.mouse.down({ x: -1, y: 0 })).rejects.toThrow(
    "x must be a zero-based safe integer",
  );
  await expect(controller.mouse.down({ x: 0, y: 3 })).rejects.toThrow(
    "outside the 10x3 terminal surface",
  );
  await expect(
    controller.mouse.down({ x: 0, y: 0 }, { button: "primary" } as never),
  ).rejects.toThrow("mouse button must be");
  await expect(controller.mouse.wheel({ x: 0, y: 0 }, "forward" as never)).rejects.toThrow(
    "mouse wheel direction must be",
  );

  let xReads = 0;
  let yReads = 0;
  await controller.mouse.down({
    get x() {
      xReads++;
      return 1;
    },
    get y() {
      yReads++;
      return 2;
    },
  });
  expect(xReads).toBe(1);
  expect(yReads).toBe(1);
});

test("detaching the runtime ingress prevents later injection", async () => {
  const { controller, detach } = setup();
  controller.host.onMouseReportingChange("button");
  detach();

  await expect(controller.mouse.down({ x: 0, y: 0 })).rejects.toThrow(
    "modeled application is not accepting mouse input",
  );
});
