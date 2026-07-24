import type { InjectionKey } from "vue";
import type { InternalInputSubscriptions } from "./io/input-subscriptions.ts";
import type { CoordinatedWriteResult } from "./io/output-coordinator.ts";

export interface AppContext {
  exit: (error?: Error) => void;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  isRawModeSupported: boolean;
  setRawMode: (mode: boolean) => void;
  writeToStdout: (data: string) => CoordinatedWriteResult;
  writeToStderr: (data: string) => CoordinatedWriteResult;
}

export interface StdinContext {
  stdin: NodeJS.ReadStream;
  isRawModeSupported: boolean;
  inputSubscriptions: InternalInputSubscriptions;
  /** Acquire one independently releasable public raw-mode hold. */
  acquirePublicRawMode: () => () => void;
}

export const AppContextKey: InjectionKey<AppContext> = Symbol("vue-tui:app");
export const StdinContextKey: InjectionKey<StdinContext> = Symbol("vue-tui:stdin");
// Provided by <Text> and the private transform mechanism; injected by <Text> to decide
// whether they render inline `virtual-text` (inside a text context) or a standalone
// yoga `text`. Replaces the former getCurrentInstance() parent-walk — see
// .agents/docs/component-authoring.md.
export const TextContextKey: InjectionKey<true> = Symbol("vue-tui:text-context");
