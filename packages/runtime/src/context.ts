import type { InjectionKey, Ref } from "vue";
import type { AnimationScheduler } from "./animation-scheduler.ts";
import type { InternalInputRoutingRuntime } from "./io/input-route-runtime.ts";
import type { InputAvailability } from "./io/input-availability.ts";

export interface AppContext {
  exit: (errorOrResult?: unknown) => void;
  waitUntilRenderFlush: () => Promise<void>;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  isRawModeSupported: boolean;
  setRawMode: (mode: boolean) => void;
  writeToStdout: (data: string) => void;
  writeToStderr: (data: string) => void;
}

export interface StdinContext {
  stdin: NodeJS.ReadStream;
  isRawModeSupported: boolean;
  readonly inputAvailability: Readonly<Ref<InputAvailability>>;
  internal_inputRouting: InternalInputRoutingRuntime;
  acquireRawMode: () => void;
  releaseRawMode: () => void;
  acquireSemanticInput: () => void;
  releaseSemanticInput: () => void;
  acquireSgrMouseMode: (level?: SgrMouseMode) => symbol;
  releaseSgrMouseMode: (token: symbol) => void;
}

export type SgrMouseMode = "button" | "drag" | "hover";

export const AppContextKey: InjectionKey<AppContext> = Symbol("vue-tui:app");
export const StdinContextKey: InjectionKey<StdinContext> = Symbol("vue-tui:stdin");
export const AnimationSchedulerKey: InjectionKey<AnimationScheduler> = Symbol("vue-tui:animation");
// Provided by <Text> and <Transform>; injected by <Text> and <Newline> to decide
// whether they render inline `virtual-text` (inside a text context) or a standalone
// yoga `text`. Replaces the former getCurrentInstance() parent-walk — see
// .agents/docs/component-authoring.md.
export const TextContextKey: InjectionKey<true> = Symbol("vue-tui:text-context");
