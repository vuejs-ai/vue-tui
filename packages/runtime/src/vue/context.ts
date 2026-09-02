import type { InjectionKey } from "vue";
import type { InputDispatcher } from "../input/input-subscriptions.ts";
import type { CoordinatedWriteResult } from "../terminal/output-coordinator.ts";

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
  inputSubscriptions: InputDispatcher;
  /** Acquire one independently releasable public raw-mode hold. */
  acquirePublicRawMode: () => () => void;
}

export const AppContextKey: InjectionKey<AppContext> = Symbol("vue-tui:app");
export const StdinContextKey: InjectionKey<StdinContext> = Symbol("vue-tui:stdin");
// Every <Text> provides this key. Descendants inject it to select the inline
// `virtual-text` host; an outer <Text> uses the Yoga-backed `text` host.
export const TextContextKey: InjectionKey<true> = Symbol("vue-tui:text-context");
