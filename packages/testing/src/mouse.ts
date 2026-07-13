import { readonly } from "vue";
import type { CellPoint } from "@vue-tui/runtime";
import type { MouseButton } from "@vue-tui/runtime/fullscreen";
import type { InternalTestInputHost } from "@vue-tui/runtime/internal";

export type TestMouseReportingLevel = "none" | "button" | "button-motion";

export interface TestMouseReportingState {
  /** `button` models 1000 + 1006; `button-motion` models 1002 + 1006. */
  readonly current: TestMouseReportingLevel;
  readonly history: readonly TestMouseReportingLevel[];
}

export interface TestMouseModifiers {
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly ctrl?: boolean;
}

export interface TestMouseButtonOptions extends TestMouseModifiers {
  /** @default "left" */
  readonly button?: MouseButton;
}

export interface TestMouse {
  readonly reporting: TestMouseReportingState;
  down(this: void, point: CellPoint, options?: TestMouseButtonOptions): Promise<void>;
  /** Emit one left-button motion fact after an unmatched left-button down. */
  move(this: void, point: CellPoint, modifiers?: TestMouseModifiers): Promise<void>;
  up(this: void, point: CellPoint, options?: TestMouseButtonOptions): Promise<void>;
  wheel(
    this: void,
    point: CellPoint,
    direction: "up" | "down" | "left" | "right",
    modifiers?: TestMouseModifiers,
  ): Promise<void>;
}

interface CreateTestMouseOptions {
  readonly columns: () => number;
  readonly rows: () => number;
  readonly assertCanEmit: () => void;
  readonly flush: () => Promise<void>;
}

export interface TestMouseController {
  readonly host: InternalTestInputHost;
  readonly mouse: TestMouse;
  clearPressedButtons(): void;
}

type InternalTestInputInject = Parameters<InternalTestInputHost["bind"]>[0];
type InternalTestMouseInput = Parameters<InternalTestInputInject>[0];

const BUTTONS = new Set<MouseButton>(["left", "middle", "right"]);
const WHEEL_DIRECTIONS = new Set(["up", "down", "left", "right"] as const);

function assertObject(value: unknown, name: string): Record<PropertyKey, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value as Record<PropertyKey, unknown>;
}

function normalizePoint(
  value: CellPoint,
  columns: number,
  rows: number,
): { readonly x: number; readonly y: number } {
  const point = assertObject(value, "mouse point");
  // Snapshot accessors once so validation and injection always use the same cell.
  const x = point.x;
  const y = point.y;
  if (!Number.isSafeInteger(x) || (x as number) < 0) {
    throw new TypeError("mouse point x must be a zero-based safe integer.");
  }
  if (!Number.isSafeInteger(y) || (y as number) < 0) {
    throw new TypeError("mouse point y must be a zero-based safe integer.");
  }
  if ((x as number) >= columns || (y as number) >= rows) {
    throw new RangeError(
      `mouse point (${String(x)}, ${String(y)}) is outside the ${columns}x${rows} terminal surface.`,
    );
  }
  return Object.freeze({ x: x as number, y: y as number });
}

function normalizeModifiers(value: TestMouseModifiers | undefined): {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
} {
  if (value === undefined) {
    return Object.freeze({ shift: false, alt: false, ctrl: false });
  }
  const modifiers = assertObject(value, "mouse modifiers");
  const shift = modifiers.shift ?? false;
  const alt = modifiers.alt ?? false;
  const ctrl = modifiers.ctrl ?? false;
  if (typeof shift !== "boolean") throw new TypeError("mouse modifier shift must be a boolean.");
  if (typeof alt !== "boolean") throw new TypeError("mouse modifier alt must be a boolean.");
  if (typeof ctrl !== "boolean") throw new TypeError("mouse modifier ctrl must be a boolean.");
  return Object.freeze({ shift, alt, ctrl });
}

function normalizeButtonOptions(value: TestMouseButtonOptions | undefined): {
  readonly button: MouseButton;
  readonly modifiers: {
    readonly shift: boolean;
    readonly alt: boolean;
    readonly ctrl: boolean;
  };
} {
  if (value === undefined) {
    return Object.freeze({ button: "left", modifiers: normalizeModifiers(undefined) });
  }
  const options = assertObject(value, "mouse button options");
  const button = options.button ?? "left";
  if (!BUTTONS.has(button as MouseButton)) {
    throw new TypeError('mouse button must be "left", "middle", or "right".');
  }
  return Object.freeze({
    button: button as MouseButton,
    modifiers: normalizeModifiers(options as TestMouseModifiers),
  });
}

export function createTestMouse(options: CreateTestMouseOptions): TestMouseController {
  const mutableReporting = {
    current: "none" as TestMouseReportingLevel,
    history: [] as TestMouseReportingLevel[],
  };
  const reporting = readonly(mutableReporting) as TestMouseReportingState;
  let inject: InternalTestInputInject | undefined;
  let unmatchedLeftDown = false;

  const host: InternalTestInputHost = {
    supportsMouse: true,
    bind(nextInject) {
      inject = nextInject;
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        if (inject === nextInject) inject = undefined;
        unmatchedLeftDown = false;
      };
    },
    onMouseReportingChange(level) {
      const publicLevel: TestMouseReportingLevel =
        level === undefined ? "none" : level === "drag" ? "button-motion" : "button";
      if (publicLevel === mutableReporting.current) return;
      mutableReporting.current = publicLevel;
      mutableReporting.history.push(publicLevel);
      if (publicLevel === "none") unmatchedLeftDown = false;
    },
  };

  const assertReporting = (required: "button" | "button-motion"): void => {
    const current = mutableReporting.current;
    if (
      (required === "button" && current !== "button" && current !== "button-motion") ||
      (required === "button-motion" && current !== "button-motion")
    ) {
      throw new Error(
        required === "button"
          ? "The modeled terminal cannot emit this mouse fact without button reporting."
          : "The modeled terminal cannot emit mouse movement without button-motion reporting.",
      );
    }
  };

  const emit = async (event: InternalTestMouseInput): Promise<void> => {
    const currentInject = inject;
    if (!currentInject) {
      throw new Error("The modeled application is not accepting mouse input.");
    }
    currentInject(event);
    await options.flush();
  };

  const point = (value: CellPoint) => normalizePoint(value, options.columns(), options.rows());

  const mouse: TestMouse = Object.freeze({
    reporting,
    async down(value: CellPoint, valueOptions?: TestMouseButtonOptions): Promise<void> {
      options.assertCanEmit();
      assertReporting("button");
      const normalizedPoint = point(value);
      const { button, modifiers } = normalizeButtonOptions(valueOptions);
      if (button === "left") unmatchedLeftDown = true;
      await emit({ type: "down", ...normalizedPoint, button, modifiers });
    },
    async move(value: CellPoint, valueModifiers?: TestMouseModifiers): Promise<void> {
      options.assertCanEmit();
      assertReporting("button-motion");
      if (!unmatchedLeftDown) {
        throw new Error("Mouse movement requires an unmatched left-button down.");
      }
      const normalizedPoint = point(value);
      const modifiers = normalizeModifiers(valueModifiers);
      await emit({ type: "drag", ...normalizedPoint, button: "left", modifiers });
    },
    async up(value: CellPoint, valueOptions?: TestMouseButtonOptions): Promise<void> {
      options.assertCanEmit();
      assertReporting("button");
      const normalizedPoint = point(value);
      const { button, modifiers } = normalizeButtonOptions(valueOptions);
      if (button === "left") unmatchedLeftDown = false;
      await emit({ type: "up", ...normalizedPoint, button, modifiers });
    },
    async wheel(
      value: CellPoint,
      direction: "up" | "down" | "left" | "right",
      valueModifiers?: TestMouseModifiers,
    ): Promise<void> {
      options.assertCanEmit();
      assertReporting("button");
      if (!WHEEL_DIRECTIONS.has(direction)) {
        throw new TypeError('mouse wheel direction must be "up", "down", "left", or "right".');
      }
      const normalizedPoint = point(value);
      const modifiers = normalizeModifiers(valueModifiers);
      await emit({ type: "wheel", ...normalizedPoint, direction, modifiers });
    },
  });

  return Object.freeze({
    host,
    mouse,
    clearPressedButtons() {
      unmatchedLeftDown = false;
    },
  });
}
