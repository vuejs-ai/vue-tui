import { defineComponent, h, type ExtractPublicPropTypes } from "vue";

const spacerProps = {};

const SpacerImpl = defineComponent({
  name: "Spacer",
  props: spacerProps,
  setup() {
    return () => h("box", { flexGrow: 1, flexShrink: 1 });
  },
});

/** Props accepted by `<Spacer>` — the vue-tui analogue of Ink's `SpacerProps`. */
export type SpacerProps = ExtractPublicPropTypes<typeof spacerProps>;

export const Spacer = SpacerImpl as typeof SpacerImpl & {
  new (): { $props: SpacerProps & { children?: never } };
};
