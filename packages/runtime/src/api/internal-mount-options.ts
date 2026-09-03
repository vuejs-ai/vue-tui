import type { MountOptions } from "./mount-options.ts";
import {
  INTERNAL_RENDER_OBSERVER,
  registerInternalMountOptions,
  type InternalMountOptionPayload,
  type InternalRenderObserver,
} from "../session/session.ts";
import {
  INTERNAL_KITTY_KEYBOARD,
  type InternalKittyKeyboardMountOptions,
} from "../terminal/kitty-keyboard.ts";
import type { TerminalStyle } from "../text/terminal-style.ts";
import {
  INTERNAL_TERMINAL_SIZE_PROBE,
  type TerminalSizeProbe,
} from "../terminal/node/terminal-size-probe.ts";
import {
  INTERNAL_SUSPENSION_HOST,
  type SuspensionHost,
} from "../terminal/node/process-suspension.ts";

export type { InternalMountOptionPayload } from "../session/session.ts";

type InternalMountOptionInput = {
  readonly onRender?: (info: { renderTime: number }) => void;
  readonly maxFps?: number;
  readonly terminalStyle?: TerminalStyle;
  readonly [INTERNAL_KITTY_KEYBOARD]?: InternalKittyKeyboardMountOptions;
  readonly [INTERNAL_RENDER_OBSERVER]?: InternalRenderObserver;
  readonly [INTERNAL_TERMINAL_SIZE_PROBE]?: TerminalSizeProbe;
};

type SuspensionHostMountOption = {
  readonly [INTERNAL_SUSPENSION_HOST]?: SuspensionHost;
};

declare const internalMountOptionsBrand: unique symbol;

export type InternalMountOptions = MountOptions & {
  readonly [internalMountOptionsBrand]: true;
};

export type InternalMountOptionsInput = MountOptions &
  InternalMountOptionInput &
  SuspensionHostMountOption;

const internalOptionKeys = [
  "onRender",
  "maxFps",
  "terminalStyle",
  INTERNAL_KITTY_KEYBOARD,
  INTERNAL_RENDER_OBSERVER,
  INTERNAL_TERMINAL_SIZE_PROBE,
  INTERNAL_SUSPENSION_HOST,
] as const;

/**
 * Associate repository-only controls with an otherwise ordinary public-options
 * object through Session-owned module-private state.
 *
 * The returned object contains only documented public keys, so inspecting it
 * cannot reveal or recreate the private controls.
 */
export function createInternalMountOptions(
  input: InternalMountOptionsInput = {},
): InternalMountOptions {
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const key of internalOptionKeys) Reflect.deleteProperty(descriptors, key);

  const options = Object.create(Object.getPrototypeOf(input), descriptors) as MountOptions;
  const payload: InternalMountOptionPayload = {
    onRender: input.onRender,
    maxFps: input.maxFps,
    terminalStyle: input.terminalStyle,
    [INTERNAL_KITTY_KEYBOARD]: input[INTERNAL_KITTY_KEYBOARD],
    [INTERNAL_RENDER_OBSERVER]: input[INTERNAL_RENDER_OBSERVER],
    [INTERNAL_TERMINAL_SIZE_PROBE]: input[INTERNAL_TERMINAL_SIZE_PROBE],
    suspensionHost: input[INTERNAL_SUSPENSION_HOST],
  };
  registerInternalMountOptions(options, payload);
  return options as InternalMountOptions;
}
