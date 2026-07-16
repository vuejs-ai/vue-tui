import type { NormalizedInputFact } from "./normalized-input.ts";
import type { MouseInputEvent, SgrMouseEvent } from "./parse-mouse.ts";

export interface InternalInputRouteEvents {
  readonly input: NormalizedInputFact;
  readonly paste: string;
  readonly mouse: MouseInputEvent;
  readonly internal_mouse: SgrMouseEvent;
}

export type InternalInputRouteName = keyof InternalInputRouteEvents;

interface InternalInputRoute<Name extends InternalInputRouteName> {
  active: boolean;
  readonly listener: (event: InternalInputRouteEvents[Name]) => void;
}

export type InternalInputRouteSnapshot = {
  readonly [Name in InternalInputRouteName]: readonly InternalInputRoute<Name>[];
};

export interface InternalInputRouteRegistry {
  attach<Name extends InternalInputRouteName>(
    name: Name,
    listener: (event: InternalInputRouteEvents[Name]) => void,
  ): () => void;
  snapshot(): InternalInputRouteSnapshot;
  /** Whether this channel had an owner when the event began. */
  had(snapshot: InternalInputRouteSnapshot, name: InternalInputRouteName): boolean;
  resolve<Name extends InternalInputRouteName>(
    snapshot: InternalInputRouteSnapshot,
    name: Name,
  ): readonly ((event: InternalInputRouteEvents[Name]) => void)[];
  emit<Name extends InternalInputRouteName>(
    snapshot: InternalInputRouteSnapshot,
    name: Name,
    event: InternalInputRouteEvents[Name],
  ): void;
  clear(): void;
}

type InternalInputRouteSets = {
  readonly [Name in InternalInputRouteName]: Set<InternalInputRoute<Name>>;
};

const routeNames = ["input", "paste", "mouse", "internal_mouse"] as const;

/**
 * Internal event routes with non-reusable attachment identity.
 *
 * A snapshot records the attachments that existed when a terminal event began.
 * Delivery filters leases that ended before dispatch exactly once, then freezes
 * that recipient list: removing a later listener during a callback does not
 * cancel its already-started delivery, and a newly attached listener waits for
 * the next event.
 */
export function createInternalInputRouteRegistry(): InternalInputRouteRegistry {
  const routes: InternalInputRouteSets = {
    input: new Set(),
    paste: new Set(),
    mouse: new Set(),
    internal_mouse: new Set(),
  };

  const routesFor = <Name extends InternalInputRouteName>(
    name: Name,
  ): Set<InternalInputRoute<Name>> => routes[name];
  const resolve = <Name extends InternalInputRouteName>(
    snapshot: InternalInputRouteSnapshot,
    name: Name,
  ): readonly ((event: InternalInputRouteEvents[Name]) => void)[] =>
    snapshot[name].filter((route) => route.active).map((route) => route.listener);

  return {
    attach(name, listener) {
      const route: InternalInputRoute<typeof name> = { active: true, listener };
      routesFor(name).add(route);
      return () => {
        if (!route.active) return;
        route.active = false;
        routesFor(name).delete(route);
      };
    },
    snapshot() {
      return Object.freeze({
        input: Object.freeze([...routes.input]),
        paste: Object.freeze([...routes.paste]),
        mouse: Object.freeze([...routes.mouse]),
        internal_mouse: Object.freeze([...routes.internal_mouse]),
      });
    },
    had(snapshot, name) {
      return snapshot[name].length > 0;
    },
    resolve,
    emit(snapshot, name, event) {
      // Resolve activity once before the first callback. This matches the useful
      // EventEmitter re-entry rule while keeping additions out of the old event.
      const recipients = resolve(snapshot, name);
      for (const listener of recipients) listener(event);
    },
    clear() {
      for (const name of routeNames) {
        for (const route of routes[name]) route.active = false;
        routes[name].clear();
      }
    },
  };
}
