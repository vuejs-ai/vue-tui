import { PassThrough } from "node:stream";
import { defineComponent, inject, onUnmounted } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Text, useFocus, useInput } from "../index.ts";
import { StdinContextKey } from "../context.ts";
import { createApp, type MountOptions } from "../render.ts";
import type { RenderMode } from "../render-session.ts";
import type { InternalInputRouteDecision } from "./input-route-policy.ts";
import type {
  InternalInputActivationRegistration,
  InternalInputRoutingRuntime,
} from "./input-route-runtime.ts";

const modes = ["inline", "fullscreen"] as const satisfies readonly RenderMode[];

const continueRoute = (): InternalInputRouteDecision => ({
  performed: false,
  continue: true,
  preventDefault: false,
  blockExternal: false,
});

function createStdin(): NodeJS.ReadStream {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    setRawMode(this: NodeJS.ReadStream) {
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
    ref() {},
    unref() {},
  });
  return stdin;
}

function createWritable(): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: true, columns: 80, rows: 24 });
  return stream;
}

function mountOptions(mode: RenderMode, stdin = createStdin()): MountOptions {
  return {
    mode,
    stdin,
    stdout: createWritable(),
    stderr: createWritable(),
    liveUpdates: true,
    maxFps: 0,
    patchConsole: false,
    kittyKeyboard: { mode: "disabled" },
  };
}

function requireRouting(): InternalInputRoutingRuntime {
  const stdin = inject(StdinContextKey);
  if (!stdin) throw new Error("missing stdin context");
  return stdin.internal_inputRouting;
}

describe.each(modes)("live selected input topology in %s mode", (mode) => {
  test("executes explicit layers independently of registration order", () => {
    const calls: string[] = [];
    const App = defineComponent(() => {
      const routing = requireRouting();
      const external = routing.registerExternal({
        id: "external",
        receive: () => calls.push("external"),
      });
      const appDefault = routing.registerDefault({
        id: "app-default",
        handle: () => {
          calls.push("app-default");
          return { performed: false, continue: true, blockExternal: false };
        },
      });
      const ownerDefault = routing.registerDefault({
        id: "owner-default",
        handle: () => {
          calls.push("owner-default");
          return { performed: false, continue: true, blockExternal: false };
        },
      });
      const ancestor = routing.registerSemantic({
        id: "ancestor",
        handle: () => (calls.push("ancestor"), continueRoute()),
      });
      const owner = routing.registerSemantic({
        id: "owner",
        handle: () => (calls.push("owner"), continueRoute()),
      });
      const boundary = routing.registerSemantic({
        id: "boundary",
        handle: () => (calls.push("boundary"), continueRoute()),
      });
      const global = routing.registerSemantic({
        id: "global",
        handle: () => (calls.push("global"), continueRoute()),
      });
      routing.select({
        applicationGlobal: [global.lease],
        activeBoundary: boundary.lease,
        focusedOwner: owner.lease,
        logicalAncestors: [ancestor.lease],
        ownerDefaults: [ownerDefault.lease],
        applicationDefaults: [appDefault.lease],
        external: external.lease,
      });
      return () => <Text>ready</Text>;
    });

    const options = mountOptions(mode);
    const app = createApp(App);
    app.mount(options);
    try {
      options.stdin!.emit("data", "x");
      expect(calls).toEqual([
        "global",
        "boundary",
        "owner",
        "ancestor",
        "owner-default",
        "app-default",
        "external",
      ]);
    } finally {
      app.unmount();
    }
  });

  test("does not let a replacement inherit a split fact", () => {
    const calls: string[] = [];
    let replace!: () => void;
    const App = defineComponent(() => {
      const routing = requireRouting();
      const global = routing.registerSemantic({
        id: "global",
        handle: (fact) => (calls.push(`global:${fact.sequence}`), continueRoute()),
      });

      const selectPlan = (label: string) => {
        const registrations: InternalInputActivationRegistration<unknown>[] = [];
        const semantic = (layer: string) => {
          const registration = routing.registerSemantic({
            id: `${label}-${layer}`,
            handle: (fact) => (calls.push(`${label}-${layer}:${fact.sequence}`), continueRoute()),
          });
          registrations.push(registration as InternalInputActivationRegistration<unknown>);
          return registration;
        };
        const defaultRoute = routing.registerDefault({
          id: `${label}-default`,
          handle: (fact) => {
            calls.push(`${label}-default:${fact.sequence}`);
            return { performed: false, continue: true, blockExternal: false };
          },
        });
        const external = routing.registerExternal({
          id: `${label}-external`,
          receive: (source) => calls.push(`${label}-external:${source.sequence}`),
        });
        registrations.push(
          defaultRoute as InternalInputActivationRegistration<unknown>,
          external as InternalInputActivationRegistration<unknown>,
        );
        const boundary = semantic("boundary");
        const owner = semantic("owner");
        const ancestor = semantic("ancestor");
        routing.select({
          applicationGlobal: [global.lease],
          activeBoundary: boundary.lease,
          focusedOwner: owner.lease,
          logicalAncestors: [ancestor.lease],
          ownerDefaults: [defaultRoute.lease],
          external: external.lease,
        });
        return () => {
          for (const registration of registrations) registration.end();
        };
      };

      let endCurrent = selectPlan("old");
      replace = () => {
        endCurrent();
        endCurrent = selectPlan("new");
      };
      return () => <Text>ready</Text>;
    });

    const options = mountOptions(mode);
    const app = createApp(App);
    app.mount(options);
    try {
      options.stdin!.emit("data", "\x1b[");
      replace();
      options.stdin!.emit("data", "A");
      options.stdin!.emit("data", "x");

      expect(calls).toEqual([
        "global:\x1b[A",
        "global:x",
        "new-boundary:x",
        "new-owner:x",
        "new-ancestor:x",
        "new-default:x",
        "new-external:x",
      ]);
    } finally {
      app.unmount();
    }
  });

  test("finishes a frozen plan before a re-entrant fact uses the replacement", () => {
    const calls: string[] = [];
    const stdin = createStdin();
    const App = defineComponent(() => {
      const routing = requireRouting();
      let selectSecond!: () => void;
      const global = routing.registerSemantic({
        id: "global",
        handle: (fact) => {
          calls.push(`global:${fact.sequence}`);
          if (fact.sequence === "x") {
            selectSecond();
            stdin.emit("data", "y");
          }
          return continueRoute();
        },
      });
      const firstAncestor = routing.registerSemantic({
        id: "first-ancestor",
        handle: (fact) => (calls.push(`first-ancestor:${fact.sequence}`), continueRoute()),
      });
      const firstBoundary = routing.registerSemantic({
        id: "first-boundary",
        handle: (fact) => {
          calls.push(`first-boundary:${fact.sequence}`);
          firstAncestor.end();
          return continueRoute();
        },
      });
      const firstExternal = routing.registerExternal({
        id: "first-external",
        receive: (source) => calls.push(`first-external:${source.sequence}`),
      });
      const secondBoundary = routing.registerSemantic({
        id: "second-boundary",
        handle: (fact) => (calls.push(`second-boundary:${fact.sequence}`), continueRoute()),
      });
      const secondAncestor = routing.registerSemantic({
        id: "second-ancestor",
        handle: (fact) => (calls.push(`second-ancestor:${fact.sequence}`), continueRoute()),
      });
      const secondExternal = routing.registerExternal({
        id: "second-external",
        receive: (source) => calls.push(`second-external:${source.sequence}`),
      });
      selectSecond = () => {
        routing.select({
          applicationGlobal: [global.lease],
          activeBoundary: secondBoundary.lease,
          logicalAncestors: [secondAncestor.lease],
          external: secondExternal.lease,
        });
      };
      routing.select({
        applicationGlobal: [global.lease],
        activeBoundary: firstBoundary.lease,
        logicalAncestors: [firstAncestor.lease],
        external: firstExternal.lease,
      });
      return () => <Text>ready</Text>;
    });

    const app = createApp(App);
    app.mount(mountOptions(mode, stdin));
    try {
      stdin.emit("data", "x");
      expect(calls).toEqual([
        "global:x",
        "first-boundary:x",
        "first-ancestor:x",
        "first-external:x",
        "global:y",
        "second-boundary:y",
        "second-ancestor:y",
        "second-external:y",
      ]);
    } finally {
      app.unmount();
    }
  });

  test("recaptures topology for the next parser fact in the same Node chunk", () => {
    const calls: string[] = [];
    const App = defineComponent(() => {
      const routing = requireRouting();
      const second = routing.registerSemantic({
        id: "second",
        handle: (fact) => (calls.push(`second:${fact.sequence}`), continueRoute()),
      });
      const first = routing.registerSemantic({
        id: "first",
        handle: (fact) => {
          calls.push(`first:${fact.sequence}`);
          routing.select({ activeBoundary: second.lease });
          return continueRoute();
        },
      });
      routing.select({ activeBoundary: first.lease });
      return () => <Text>ready</Text>;
    });

    const options = mountOptions(mode);
    const app = createApp(App);
    app.mount(options);
    try {
      options.stdin!.emit("data", "x\x7f");
      expect(calls).toEqual(["first:x", "second:\x7f"]);
    } finally {
      app.unmount();
    }
  });

  test("isolates a modal and lets semantic routes prevent delayed defaults", async () => {
    const calls: string[] = [];
    const external: string[] = [];
    let currentFocus = () => "unmounted";
    let preventCtrlC = true;
    const App = defineComponent(() => {
      const routing = requireRouting();
      const first = useFocus({ id: "first", autoFocus: true });
      const second = useFocus({ id: "second" });
      currentFocus = () =>
        first.isFocused.value ? "first" : second.isFocused.value ? "second" : "none";
      useInput((input) => calls.push(`compatibility:${input}`));
      onUnmounted(() => calls.push("unmounted"));

      const paneExternal = routing.registerExternal({
        id: "pane-external",
        receive: (source) => external.push(source.sequence),
      });
      const pane = routing.registerSemantic({
        id: "pane",
        handle: (fact) => {
          if (fact.kind === "key" && fact.key.name === "tab") {
            calls.push(`pane:tab:${currentFocus()}`);
            return {
              performed: true,
              continue: true,
              preventDefault: true,
              blockExternal: false,
            };
          }
          if (fact.kind === "key" && fact.key.name === "c" && fact.key.modifiers.ctrl) {
            calls.push(`pane:ctrl-c:${preventCtrlC ? "prevent" : "allow"}`);
            return {
              performed: true,
              continue: true,
              preventDefault: preventCtrlC,
              blockExternal: false,
            };
          }
          calls.push(`pane:${fact.sequence}`);
          return continueRoute();
        },
      });
      const selectPane = () =>
        routing.select({ activeBoundary: pane.lease, external: paneExternal.lease });
      const modal = routing.registerSemantic({
        id: "modal",
        handle: (fact) => {
          calls.push(`modal:${fact.sequence}`);
          if (fact.kind === "key" && fact.key.name === "escape") {
            selectPane();
            return {
              performed: true,
              continue: false,
              preventDefault: true,
              blockExternal: true,
            };
          }
          return { ...continueRoute(), blockExternal: true };
        },
      });
      routing.select({ activeBoundary: modal.lease });
      return () => <Text>ready</Text>;
    });

    const options = mountOptions(mode);
    const app = createApp(App);
    app.mount({ ...options, exitOnCtrlC: true });
    const exited = app.waitUntilExit();

    options.stdin!.emit("data", "\x1b[15~");
    options.stdin!.emit("data", "\x1b");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(currentFocus()).toBe("first");
    options.stdin!.emit("data", "\t");
    expect(currentFocus()).toBe("first");
    options.stdin!.emit("data", "\x03");
    options.stdin!.emit("data", "z");
    preventCtrlC = false;
    options.stdin!.emit("data", "\x03");
    await exited;

    expect(calls).toEqual([
      "modal:\x1b[15~",
      "modal:\x1b",
      "pane:tab:first",
      "pane:ctrl-c:prevent",
      "pane:z",
      "pane:ctrl-c:allow",
      "unmounted",
    ]);
    expect(external).toEqual(["\t", "\x03", "z"]);
  });

  test("fails one application closed while shared stdin still reaches another", () => {
    const stdin = createStdin();
    const firstCalls: string[] = [];
    const secondCalls: string[] = [];
    const ThrowingApp = defineComponent(() => {
      const routing = requireRouting();
      const external = routing.registerExternal({
        id: "external",
        receive: () => firstCalls.push("external"),
      });
      const defaultRoute = routing.registerDefault({
        id: "default",
        handle: () => {
          firstCalls.push("default");
          return { performed: false, continue: true, blockExternal: false };
        },
      });
      const later = routing.registerSemantic({
        id: "later",
        handle: () => (firstCalls.push("later"), continueRoute()),
      });
      const throwing = routing.registerSemantic({
        id: "throwing",
        handle: () => {
          firstCalls.push("throwing");
          throw new Error("route failed");
        },
      });
      routing.select({
        applicationGlobal: [throwing.lease],
        activeBoundary: later.lease,
        ownerDefaults: [defaultRoute.lease],
        external: external.lease,
      });
      return () => <Text>first</Text>;
    });
    const ReceivingApp = defineComponent(() => {
      useInput((input) => secondCalls.push(input));
      return () => <Text>second</Text>;
    });

    const first = createApp(ThrowingApp);
    const second = createApp(ReceivingApp);
    first.mount(mountOptions(mode, stdin));
    second.mount(mountOptions(mode, stdin));
    try {
      expect(() => stdin.emit("data", "x")).toThrow("route failed");
      expect(firstCalls).toEqual(["throwing"]);
      expect(secondCalls).toEqual(["x"]);
    } finally {
      first.unmount();
      second.unmount();
    }
  });
});
