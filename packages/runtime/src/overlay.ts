import { defineComponent, h, inject, type Component, type PropType } from "vue";
import Box from "./components/box.vue";
import Text from "./components/text.vue";
import { DevStateKey, type DevState } from "./hmr.ts";

const ErrorDisplay = defineComponent({
  name: "ErrorDisplay",
  props: {
    error: {
      type: Object as PropType<DevState & { type: "error" }>,
      required: true as const,
    },
  },
  setup(props) {
    return () =>
      h(
        Box,
        {
          flexDirection: "column",
          borderStyle: "single",
          borderColor: "red",
          paddingX: 1,
        },
        // Pass children as a slot FUNCTION, not an array: a component (Box) that
        // receives array children triggers Vue's "Non-function value encountered
        // for default slot" warning, which the runtime routes to the frame writer
        // and is therefore visible in a real terminal.
        () => [
          h(Text, { color: "red", bold: true }, () => "Build Error"),
          h(Text, {}, () => props.error.error.message),
          props.error.error.loc
            ? h(
                Text,
                { dimColor: true },
                () =>
                  `${props.error.error.loc!.file}:${props.error.error.loc!.line}:${props.error.error.loc!.column}`,
              )
            : null,
        ],
      );
  },
});

const StatusLine = defineComponent({
  name: "StatusLine",
  props: {
    paths: {
      type: Array as PropType<string[]>,
      required: true as const,
    },
  },
  setup(props) {
    return () => h(Text, { dimColor: true }, () => `[HMR] updated: ${props.paths.join(", ")}`);
  },
});

export function createDevOverlayWrapper(
  rootComponent: Component,
  rootProps?: Record<string, unknown>,
): Component {
  return defineComponent({
    name: "DevOverlay",
    setup() {
      const state = inject(DevStateKey)!;

      return () => {
        if (state.value.type === "error") {
          return h(ErrorDisplay, { error: state.value });
        }

        // Children as slot FUNCTIONS (not arrays): a component receiving array
        // children triggers Vue's "Non-function value encountered for default
        // slot" warning. This wrapper renders on EVERY dev session, so an array
        // here would surface that warning in the terminal on every dev boot.
        return h(Box, { flexDirection: "column", flexGrow: 1 }, () => [
          h(Box, { flexGrow: 1 }, () => [h(rootComponent, rootProps)]),
          state.value.type === "update" ? h(StatusLine, { paths: state.value.paths }) : null,
        ]);
      };
    },
  });
}
