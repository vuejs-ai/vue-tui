import type { Readable, Writable } from "node:stream";
import type { ColorProfile } from "../color-profile.ts";
import type { RenderMode } from "../render-session.ts";

/** Options for mounting one terminal application. */
export interface MountOptions {
  readonly stdout?: Writable;
  readonly stdin?: Readable;
  readonly stderr?: Writable;
  /**
   * Select the terminal screen model requested by this application.
   * Omission requests Inline. On a live TTY, an explicit Fullscreen request
   * requires positive terminal dimensions and otherwise fails before setup or
   * terminal mutation. On non-TTY stdout, Inline and Fullscreen select the same
   * supported non-interactive document host.
   *
   * @default 'inline'
   */
  readonly mode?: RenderMode;
  /**
   * Select terminal styling for this application. Omission and `true` detect
   * the selected stdout and honor host color controls. `false` emits no SGR
   * styling; a named profile forces that capability, including for SGR already
   * present in rendered text.
   *
   * @default true
   */
  readonly color?: boolean | ColorProfile;
  /**
   * Patch `console.*` methods to route output through the TUI frame
   * coordinator (writeToStdout / writeToStderr) so that console.log calls do
   * not corrupt the rendered UI.
   *
   * @default true
   */
  readonly patchConsole?: boolean;
  /**
   * Exit before delivering an exact Ctrl+C key. Omission leaves Ctrl+C as
   * ordinary managed input; bracketed paste never triggers this option.
   *
   * @default false
   */
  readonly exitOnCtrlC?: boolean;
}
