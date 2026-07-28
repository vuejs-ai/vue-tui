export const EVENT_ADDRESS_ENV = "VUE_TUI_TEST_EVENTS";

/**
 * Events the fixtures report, as opposed to the ones the runtime reports
 * (`RUNTIME_TEST_EVENT`).
 *
 * This module stays dependency-free because both sides import it: the parent
 * channel in a vitest worker, and the fixtures inside the child.
 */
export const FIXTURE_TEST_EVENT = Object.freeze({
  appMounted: "app:mounted",
  appUnmounted: "app:unmounted",
  appExit: "app:exit",
  appSetupRan: "app:setup-ran",
} as const);

/**
 * The event stream spans application generations during a Vite config restart.
 * Only this launcher-owned event terminates it; `app:exit` terminates one app.
 */
export const EVENT_STREAM_END = "harness:event-stream-end";

/** Parent-to-launcher control message used to finish reporting before teardown. */
export const EVENT_STREAM_END_REQUEST = "end-event-stream\n";
