import type { MountOptions } from "./render.ts";
import type { ClipboardTransport } from "./clipboard/clipboard-service.ts";
import {
  INTERNAL_KITTY_KEYBOARD,
  type InternalKittyKeyboardMountOptions,
} from "./io/kitty-keyboard.ts";
import { INTERNAL_RENDER_OBSERVER, type InternalRenderObserver } from "./io/render-observer.ts";
import { INTERNAL_TEST_INPUT_HOST, type InternalTestInputHost } from "./io/test-input-host.ts";
import { INTERNAL_TERMINAL_SIZE_PROBE, type TerminalSizeProbe } from "./terminal-size-probe.ts";
import { INTERNAL_SUSPENSION_HOST, type SuspensionHost } from "./process-suspension.ts";

export interface InternalMountOptionPayload {
  readonly liveUpdates?: boolean;
  readonly onRender?: (info: { renderTime: number }) => void;
  readonly maxFps?: number;
  readonly incrementalRendering?: boolean;
  readonly clipboard?: ClipboardTransport;
  readonly [INTERNAL_KITTY_KEYBOARD]?: InternalKittyKeyboardMountOptions;
  readonly [INTERNAL_RENDER_OBSERVER]?: InternalRenderObserver;
  readonly [INTERNAL_TEST_INPUT_HOST]?: InternalTestInputHost;
  readonly [INTERNAL_TERMINAL_SIZE_PROBE]?: TerminalSizeProbe;
  readonly [INTERNAL_SUSPENSION_HOST]?: SuspensionHost;
}

declare const internalMountOptionsBrand: unique symbol;

export type InternalMountOptions = MountOptions & {
  readonly [internalMountOptionsBrand]: true;
};

export type InternalMountOptionsInput = MountOptions & InternalMountOptionPayload;

const internalMountOptions = new WeakMap<object, InternalMountOptionPayload>();
const noInternalMountOptions = Object.freeze({}) as InternalMountOptionPayload;

const internalOptionKeys = [
  "liveUpdates",
  "onRender",
  "maxFps",
  "incrementalRendering",
  "clipboard",
  INTERNAL_KITTY_KEYBOARD,
  INTERNAL_RENDER_OBSERVER,
  INTERNAL_TEST_INPUT_HOST,
  INTERNAL_TERMINAL_SIZE_PROBE,
  INTERNAL_SUSPENSION_HOST,
] as const;

/**
 * Associate repository-only controls with an otherwise ordinary public-options
 * object through module-private state.
 *
 * This helper is built only into the repository's unpublished `/internal`
 * entry and Runtime-owned testing entry. The returned object contains only the
 * documented public keys, so inspecting it cannot reveal or recreate the
 * private controls.
 */
export function createInternalMountOptions(
  input: InternalMountOptionsInput = {},
): InternalMountOptions {
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const key of internalOptionKeys) Reflect.deleteProperty(descriptors, key);

  const options = Object.create(Object.getPrototypeOf(input), descriptors) as MountOptions;
  const payload: InternalMountOptionPayload = {
    liveUpdates: input.liveUpdates,
    onRender: input.onRender,
    maxFps: input.maxFps,
    incrementalRendering: input.incrementalRendering,
    clipboard: input.clipboard,
    [INTERNAL_KITTY_KEYBOARD]: input[INTERNAL_KITTY_KEYBOARD],
    [INTERNAL_RENDER_OBSERVER]: input[INTERNAL_RENDER_OBSERVER],
    [INTERNAL_TEST_INPUT_HOST]: input[INTERNAL_TEST_INPUT_HOST],
    [INTERNAL_TERMINAL_SIZE_PROBE]: input[INTERNAL_TERMINAL_SIZE_PROBE],
    [INTERNAL_SUSPENSION_HOST]: input[INTERNAL_SUSPENSION_HOST],
  };
  internalMountOptions.set(options, Object.freeze(payload));
  return options as InternalMountOptions;
}

export function getInternalMountOptions(options: object): InternalMountOptionPayload {
  return internalMountOptions.get(options) ?? noInternalMountOptions;
}
