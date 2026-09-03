import { inject, type InjectionKey } from "vue";
import type { Readable } from "node:stream";
import type { InputDispatcher } from "../input/input-subscriptions.ts";
import type { InternalGeometryService } from "../session/geometry-service.ts";
import type { InternalRenderSessionService } from "../session/render-session.ts";
import type { RenderedTargetController } from "../session/rendered-target.ts";

/** Outcome reported by Runtime's coordinated side-output composables. */
export type CoordinatedWriteResult =
  | {
      readonly status: "accepted";
      readonly writable: true;
    }
  | {
      readonly status: "accepted";
      readonly writable: false;
      readonly ready: Promise<void>;
    }
  | {
      readonly status: "blocked";
      readonly ready: Promise<void>;
    };

export interface AppContext {
  exit: (error?: Error) => void;
  writeToStdout: (data: string) => CoordinatedWriteResult;
  writeToStderr: (data: string) => CoordinatedWriteResult;
}

export interface StdinContext {
  stdin: Readable;
  isRawModeSupported: boolean;
  inputSubscriptions: InputDispatcher;
  /** Acquire one independently releasable public raw-mode hold. */
  acquirePublicRawMode: () => () => void;
}

export const AppContextKey: InjectionKey<AppContext> = Symbol("vue-tui:app");
export const StdinContextKey: InjectionKey<StdinContext> = Symbol("vue-tui:stdin");
export const RenderedTargetControllerKey: InjectionKey<RenderedTargetController> = Symbol(
  "vue-tui:rendered-target-controller",
);
export const InternalGeometryServiceKey: InjectionKey<InternalGeometryService> = Symbol(
  "vue-tui:geometry-service",
);
export const InternalRenderSessionKey: InjectionKey<InternalRenderSessionService> =
  Symbol("vue-tui:render-session");

export function useOptionalInternalRenderSession(): InternalRenderSessionService | undefined {
  return inject(InternalRenderSessionKey, undefined);
}

export function useInternalRenderSession(): InternalRenderSessionService {
  const service = useOptionalInternalRenderSession();
  if (!service) {
    throw new Error("render session is unavailable outside a vue-tui render tree");
  }
  return service;
}
// Every <Text> provides this key. Descendants inject it to select the inline
// `virtual-text` host; an outer <Text> uses the Yoga-backed `text` host.
export const TextContextKey: InjectionKey<true> = Symbol("vue-tui:text-context");
