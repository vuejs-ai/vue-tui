import { defineComponent, h, inject, type Component, type PropType } from "@vue/runtime-core";
import { Box } from "./components/Box.ts";
import { Text } from "./components/Text.ts";
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
        [
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

        return h(Box, { flexDirection: "column", flexGrow: 1 }, [
          h(Box, { flexGrow: 1 }, [h(rootComponent, rootProps)]),
          state.value.type === "update" ? h(StatusLine, { paths: state.value.paths }) : null,
        ]);
      };
    },
  });
}
