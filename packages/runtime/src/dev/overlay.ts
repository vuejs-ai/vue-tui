import {
  defineComponent,
  h,
  inject,
  onErrorCaptured,
  type Component,
  type ComponentPublicInstance,
  type InjectionKey,
  type PropType,
} from "vue";
import Box from "../vue/components/box.vue";
import Text from "../vue/components/text.vue";
import { DevStateKey, reportDevRenderError, type DevState } from "./hmr.ts";

export type DevOverlayPresentation = "absolute" | "flow";

export const DevOverlayPresentationKey: InjectionKey<DevOverlayPresentation> =
  Symbol("DevOverlayPresentation");

function errorSummary(message: string): string {
  return (
    message
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0)
      ?.trim() ?? message
  );
}

const ErrorDisplay = defineComponent({
  name: "ErrorDisplay",
  props: {
    error: {
      type: Object as PropType<DevState & { type: "error" }>,
      required: true as const,
    },
    presentation: {
      type: String as PropType<DevOverlayPresentation>,
      required: true as const,
    },
  },
  setup(props) {
    return () => {
      const message = errorSummary(props.error.error.message);
      const location =
        props.error.error.loc !== undefined &&
        typeof props.error.error.loc.file === "string" &&
        props.error.error.loc.file.length > 0
          ? `${props.error.error.loc.file}:${props.error.error.loc.line}:${props.error.error.loc.column}`
          : undefined;
      const placement =
        props.presentation === "absolute"
          ? ({ position: "absolute", top: 0, left: 0 } as const)
          : {};
      return h(
        Box,
        {
          ...placement,
          flexDirection: "column",
          flexShrink: 0,
          borderStyle: "single",
          borderColor: "red",
          paddingLeft: 1,
          paddingRight: 1,
        },
        // Pass children as a slot FUNCTION, not an array: a component (Box) that
        // receives array children triggers Vue's "Non-function value encountered
        // for default slot" warning, which the runtime routes to the frame writer
        // and is therefore visible in a real terminal.
        () => [
          props.presentation === "absolute"
            ? // A raw internal host fill can use the terminal-default background
              // without widening Box's public color API. Absolute siblings
              // otherwise leave transparent blank cells and let user text show
              // through the diagnostic.
              h("tui-box", {
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                backgroundColor: "default",
              })
            : null,
          h(Text, { color: "red", bold: true }, () =>
            props.error.error.phase === "render" ? "Render Error" : "Build Error",
          ),
          h(Text, { wrap: "truncate" }, () => message),
          h(
            Text,
            { dimColor: true },
            () => "Application held up by the dev overlay until this error is fixed.",
          ),
          location !== undefined ? h(Text, { dimColor: true }, () => location) : null,
        ],
      );
    };
  },
});

const StatusLine = defineComponent({
  name: "StatusLine",
  props: {
    paths: {
      type: Array as PropType<string[]>,
      required: true as const,
    },
    presentation: {
      type: String as PropType<DevOverlayPresentation>,
      required: true as const,
    },
  },
  setup(props) {
    return () => {
      const line = h(Text, { dimColor: true }, () => `[HMR] updated: ${props.paths.join(", ")}`);
      // Fullscreen owns a viewport, so the status line must draw OVER it like the
      // error panel does. As a flow sibling it stole a row for the two seconds it
      // was visible and then gave it back, relayouting the whole tree twice on
      // every successful edit and moving anything anchored to the bottom.
      return props.presentation === "absolute"
        ? h(Box, { position: "absolute", bottom: 0, left: 0 }, () => [line])
        : line;
    };
  },
});

// The two phases that produce a component's output. Both are reached by an
// ordinary edit: the generated HMR accept callback recreates the instance inside
// Vite's `fetchUpdate` closure, which has no `catch`, so a throw from either one
// escapes as an unhandled rejection and Node ends the dev process.
//
// Deliberately not every phase. A throw from an event handler, a watcher, or a
// lifecycle hook leaves the tree able to render, and swallowing those would hide
// failures the developer needs to see land in their own handler.
const HELD_ERROR_PHASES = new Set(["setup function", "render function"]);

const DevRenderErrorBoundary = defineComponent({
  name: "DevRenderErrorBoundary",
  setup(_props, { slots }) {
    onErrorCaptured((error, _instance, info) => {
      if (!HELD_ERROR_PHASES.has(info)) return;
      reportDevRenderError(error);
      return false;
    });
    return () => slots.default?.();
  },
});

export function createDevOverlayWrapper(
  rootComponent: Component,
  rootProps?: Record<string, unknown>,
  captureRoot?: (instance: ComponentPublicInstance | null) => void,
): Component {
  return defineComponent({
    name: "DevOverlay",
    setup() {
      const state = inject(DevStateKey)!;
      const presentation = inject(DevOverlayPresentationKey, "flow");

      return () =>
        // Children as slot FUNCTIONS (not arrays): a component receiving array
        // children triggers Vue's "Non-function value encountered for default
        // slot" warning. This wrapper renders on EVERY dev session, so an array
        // here would surface that warning in the terminal on every dev boot.
        h(Box, { flexDirection: "column", flexGrow: 1 }, () => [
          h(Box, { flexGrow: 1, flexShrink: presentation === "flow" ? 0 : 1 }, () => [
            h(DevRenderErrorBoundary, null, () => [
              h(rootComponent, { ...rootProps, ref: captureRoot }),
            ]),
          ]),
          state.value.type === "error"
            ? h(ErrorDisplay, { error: state.value, presentation })
            : null,
          state.value.type === "update"
            ? h(StatusLine, { paths: state.value.paths, presentation })
            : null,
        ]);
    },
  });
}
