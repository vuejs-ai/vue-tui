import type { InjectionKey, Ref } from "vue";
import type {
  InternalInputRoutingDemandLease,
  InternalInputRoutingRuntime,
} from "./io/input-route-runtime.ts";
import type { InputAvailability } from "./io/input-availability.ts";
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
  readonly inputAvailability: Readonly<Ref<InputAvailability>>;
  internal_inputRouting: InternalInputRoutingRuntime;
  /** Acquire one independently releasable public raw-mode hold. */
  acquirePublicRawMode: () => () => void;
  /** Returns false when output capacity must reconcile before raw input can activate. */
  acquireRawMode: () => boolean | void;
  releaseRawMode: () => void;
  acquireSemanticInput: () => InternalInputRoutingDemandLease;
  acquireSgrMouseMode: (level?: SgrMouseMode) => symbol;
  releaseSgrMouseMode: (token: symbol) => void;
}

export type SgrMouseMode = "button" | "drag" | "hover";

export const AppContextKey: InjectionKey<AppContext> = Symbol("vue-tui:app");
export const StdinContextKey: InjectionKey<StdinContext> = Symbol("vue-tui:stdin");
// Provided by <Text> and the private transform mechanism; injected by <Text> to decide
// whether they render inline `virtual-text` (inside a text context) or a standalone
// yoga `text`. Replaces the former getCurrentInstance() parent-walk — see
// .agents/docs/component-authoring.md.
export const TextContextKey: InjectionKey<true> = Symbol("vue-tui:text-context");
