import type { Component } from "vue";
import {
  createSessionApp,
  type RootProps,
  type SessionAppExtension,
  type SessionApp,
  type SessionMember,
} from "../session/session.ts";
import {
  acquireDevSession,
  devState,
  DevStateKey,
  isDevConnected,
  notifyDevExit,
  resetDevState,
  unregisterDevSession,
} from "./hmr.ts";
import { createDevOverlayWrapper, DevOverlayPresentationKey } from "./overlay.ts";
import type { DevSession } from "./session.ts";

/** Create a terminal application, adding the development lifetime when connected to Vite. */
export function createApp(root: Component, rootProps?: RootProps | null): SessionApp {
  if (!isDevConnected()) return createSessionApp(root, rootProps ?? null);

  resetDevState();
  let devSession: DevSession | null = null;

  function releaseDevSession(disposedSession: SessionMember): void {
    const active = devSession;
    if (!active?.release(disposedSession)) return;
    unregisterDevSession(active);
  }

  const extension: SessionAppExtension = {
    prepareRoot(currentRoot, currentProps, captureUserRoot) {
      return {
        root: createDevOverlayWrapper(currentRoot, currentProps ?? undefined, captureUserRoot),
        rootProps: null,
      };
    },
    configureApp(app, { fixedViewport }) {
      app.provide(DevStateKey, devState);
      app.provide(DevOverlayPresentationKey, fixedViewport ? "absolute" : "flow");
    },
    mounted(session, controls) {
      const active = acquireDevSession();
      active.build({
        session,
        settleExit: controls.settleExit,
        waitUntilExit: controls.waitUntilExit,
      });
      devSession = active;
    },
    disposed(session) {
      releaseDevSession(session);
    },
    exitSettled() {
      notifyDevExit();
    },
  };

  return createSessionApp(root, rootProps ?? null, extension);
}
