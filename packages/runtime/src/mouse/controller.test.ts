import { describe, expect, test, vi } from "vite-plus/test";
import type { StdinContext } from "../context.ts";
import { createBox } from "../host/nodes.ts";
import { createInternalInputRouteRegistry } from "../io/input-routes.ts";
import { createInternalInputRoutingRuntime } from "../io/input-route-runtime.ts";
import { createMouseController } from "./controller.ts";

function createStdinContext(overrides: Partial<StdinContext> = {}): StdinContext {
  return {
    stdin: {} as NodeJS.ReadStream,
    isRawModeSupported: true,
    internal_routes: createInternalInputRouteRegistry(),
    internal_inputRouting: createInternalInputRoutingRuntime(),
    internal_exitOnCtrlC: false,
    acquireRawMode: vi.fn(),
    releaseRawMode: vi.fn(),
    setBracketedPasteMode: vi.fn(),
    acquireSgrMouseMode: vi.fn(() => Symbol("mouse")),
    releaseSgrMouseMode: vi.fn(),
    ...overrides,
  };
}

describe("mouse controller cleanup", () => {
  test("rolls back a draggable when its first mouse acquisition throws", () => {
    const acquireRawMode = vi.fn();
    const releaseRawMode = vi.fn();
    const acquireSgrMouseMode = vi
      .fn<StdinContext["acquireSgrMouseMode"]>()
      .mockImplementationOnce(() => {
        throw new Error("SGR acquisition failed");
      })
      .mockImplementationOnce(() => Symbol("mouse"));
    const releaseSgrMouseMode = vi.fn();
    const stdin = createStdinContext({
      acquireRawMode,
      releaseRawMode,
      acquireSgrMouseMode,
      releaseSgrMouseMode,
    });
    const controller = createMouseController({ stdin, fullscreen: true, now: () => 0 });

    expect(() => controller.registerDraggable(createBox(), {})).toThrow("SGR acquisition failed");
    const unregister = controller.registerDraggable(createBox(), {});
    unregister();

    expect(acquireRawMode).toHaveBeenCalledTimes(2);
    expect(releaseRawMode).toHaveBeenCalledTimes(2);
    expect(acquireSgrMouseMode).toHaveBeenCalledTimes(2);
    expect(releaseSgrMouseMode).toHaveBeenCalledOnce();
    expect(stdin.internal_routes.had(stdin.internal_routes.snapshot(), "internal_mouse")).toBe(
      false,
    );
  });

  test("releases raw mode even when releasing SGR mouse mode throws", () => {
    const releaseRawMode = vi.fn();
    const releaseSgrMouseMode = vi.fn(() => {
      throw new Error("SGR release failed");
    });
    const stdin = createStdinContext({ releaseRawMode, releaseSgrMouseMode });
    const controller = createMouseController({ stdin, fullscreen: true, now: () => 0 });
    const unregister = controller.registerDraggable(createBox(), {});

    expect(() => unregister()).toThrow("SGR release failed");
    expect(releaseSgrMouseMode).toHaveBeenCalledOnce();
    expect(releaseRawMode).toHaveBeenCalledOnce();
    expect(stdin.internal_routes.had(stdin.internal_routes.snapshot(), "internal_mouse")).toBe(
      false,
    );
  });
});
