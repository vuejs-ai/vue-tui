import type { InjectionKey, ShallowRef } from "vue";
import type { EventEmitter } from "node:events";

export interface CursorPosition {
  x: number;
  y: number;
}

export interface AppContext {
  exit: (errorOrResult?: unknown) => void;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  debug: boolean;
  interactive: boolean;
  isRawModeSupported: boolean;
  setRawMode: (mode: boolean) => void;
  writeToStdout: (data: string) => void;
  writeToStderr: (data: string) => void;
  cursorPosition: CursorPosition | undefined;
  setCursorPosition: (pos: CursorPosition | undefined) => void;
}

export interface FocusContext {
  activeId: string | null;
  activeIdRef: ShallowRef<string | null>;
  enabled: boolean;
  enableFocus: () => void;
  disableFocus: () => void;
  focusNext: () => void;
  focusPrevious: () => void;
  focus: (id: string) => void;
  blur: () => void;
  add: (id: string, options: { autoFocus?: boolean }) => void;
  remove: (id: string) => void;
  activate: (id: string) => void;
  deactivate: (id: string) => void;
  subscribe: (id: string, fn: (focused: boolean) => void) => () => void;
}

export interface StdinContext {
  stdin: NodeJS.ReadStream;
  setRawMode: (mode: boolean) => void;
  isRawModeSupported: boolean;
  internal_eventEmitter: EventEmitter;
  internal_exitOnCtrlC: boolean;
  acquireRawMode: () => void;
  releaseRawMode: () => void;
  setBracketedPasteMode: (enabled: boolean) => void;
}

export const AppContextKey: InjectionKey<AppContext> = Symbol("vue-tui:app");
export const FocusContextKey: InjectionKey<FocusContext> = Symbol("vue-tui:focus");
export const StdinContextKey: InjectionKey<StdinContext> = Symbol("vue-tui:stdin");
