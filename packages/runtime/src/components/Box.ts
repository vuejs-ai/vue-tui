import { defineComponent, h, inject, type ExtractPublicPropTypes, type PropType } from "vue";
import cliBoxes from "cli-boxes";
import { AppContextKey } from "../context.ts";
import type { WithChildren } from "./with-children.ts";

type Spacing = number;
type FlexDirection = "row" | "row-reverse" | "column" | "column-reverse";
type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";
type Align = "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
type AlignSelf = "auto" | "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
type AlignContent =
  | "flex-start"
  | "center"
  | "flex-end"
  | "stretch"
  | "space-between"
  | "space-around"
  | "space-evenly";
type Justify =
  | "flex-start"
  | "center"
  | "flex-end"
  | "space-between"
  | "space-around"
  | "space-evenly";
type BorderStyle =
  | "single"
  | "double"
  | "round"
  | "bold"
  | "singleDouble"
  | "doubleSingle"
  | "classic"
  | "arrow";

// Matches the shape of the cliBoxes value type — the same alias used in paint.ts.
// Exported so consumers can type their custom border objects (Ink parity, G13).
export type BoxStyle = (typeof cliBoxes)[keyof cliBoxes.Boxes];

export type AriaRole =
  | "button"
  | "checkbox"
  | "combobox"
  | "list"
  | "listbox"
  | "listitem"
  | "menu"
  | "menuitem"
  | "option"
  | "progressbar"
  | "radio"
  | "radiogroup"
  | "tab"
  | "tablist"
  | "table"
  | "textbox"
  | "timer"
  | "toolbar";

export interface AriaState {
  busy?: boolean;
  checked?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  multiline?: boolean;
  multiselectable?: boolean;
  readonly?: boolean;
  required?: boolean;
  selected?: boolean;
}

const boxProps = {
  flexDirection: String as PropType<FlexDirection>,
  flexGrow: Number,
  flexShrink: Number,
  flexBasis: [Number, String],
  flexWrap: String as PropType<FlexWrap>,
  alignItems: String as PropType<Align>,
  alignSelf: String as PropType<AlignSelf>,
  justifyContent: String as PropType<Justify>,
  gap: Number,
  columnGap: Number,
  rowGap: Number,

  width: [Number, String],
  height: [Number, String],
  minWidth: [Number, String],
  minHeight: [Number, String],
  maxWidth: [Number, String],
  maxHeight: [Number, String],
  aspectRatio: Number,
  alignContent: String as PropType<AlignContent>,
  position: String as PropType<"absolute" | "relative" | "static">,
  top: [Number, String],
  right: [Number, String],
  bottom: [Number, String],
  left: [Number, String],

  margin: Number as PropType<Spacing>,
  marginX: Number,
  marginY: Number,
  marginTop: Number,
  marginBottom: Number,
  marginLeft: Number,
  marginRight: Number,
  padding: Number,
  paddingX: Number,
  paddingY: Number,
  paddingTop: Number,
  paddingBottom: Number,
  paddingLeft: Number,
  paddingRight: Number,

  // Accept either a preset name string or a full custom BoxStyle object (Ink parity, G13).
  // Ink types borderStyle as `keyof Boxes | BoxStyle`; we mirror that here.
  borderStyle: [String, Object] as PropType<BorderStyle | BoxStyle>,
  borderColor: [String, Array],
  // `default: undefined` is intentional and load-bearing: Vue's boolean-casting
  // rule coerces absent Boolean props to `false` only when there is no explicit
  // default. Adding `default: undefined` suppresses that coercion so absent
  // per-edge dim props arrive in the paint pass as `undefined`, not `false`.
  // This lets `edgeDim = (perEdge ?? generalDim)` correctly fall back to the
  // general value only when the per-edge prop was truly omitted — mirroring
  // Ink render-border.ts:54 which uses real-undefined via React's prop model
  // (G16). The `Boolean` type is kept so Vue still accepts bare-attribute
  // `<Box borderDimColor>` in templates (coerces `""` → `true`) and passes
  // TypeScript type-checking for consumers.
  borderDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderTopDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderBottomDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderLeftDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderRightDimColor: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  borderTop: { type: Boolean, default: true },
  borderBottom: { type: Boolean, default: true },
  borderLeft: { type: Boolean, default: true },
  borderRight: { type: Boolean, default: true },
  borderTopColor: [String, Array],
  borderBottomColor: [String, Array],
  borderLeftColor: [String, Array],
  borderRightColor: [String, Array],
  borderBackgroundColor: [String, Array],
  borderTopBackgroundColor: [String, Array],
  borderBottomBackgroundColor: [String, Array],
  borderLeftBackgroundColor: [String, Array],
  borderRightBackgroundColor: [String, Array],

  backgroundColor: [String, Array],
  overflow: String as PropType<"visible" | "hidden">,
  overflowX: String as PropType<"visible" | "hidden">,
  overflowY: String as PropType<"visible" | "hidden">,
  display: String as PropType<"flex" | "none">,

  ariaLabel: String,
  ariaHidden: Boolean,
  ariaRole: String as PropType<AriaRole>,
  ariaState: Object as PropType<AriaState>,
};

const BoxImpl = defineComponent({
  name: "Box",
  props: boxProps,
  setup(props, { slots }) {
    const appCtx = inject(AppContextKey, null);

    return () => {
      const isScreenReaderEnabled = appCtx?.isScreenReaderEnabled ?? false;

      // When screen reader is enabled and aria-hidden is set, render nothing.
      if (isScreenReaderEnabled && props.ariaHidden) {
        return null;
      }

      // Validate borderStyle during RENDER so an unknown name is caught by
      // vue-tui's error boundary (onErrorCaptured → ErrorOverview), exactly like
      // any other component render error. Ink crashes on an unknown borderStyle
      // with a raw TypeError during paint (render-border.ts reads box.topLeft off
      // cliBoxes[name] === undefined); we align to that "throw on unknown" contract
      // but do it here rather than in paint, where a throw would unwind through
      // Vue's post-flush commit and wedge its scheduler. Only a NON-EMPTY unknown
      // STRING throws: a falsy value (false/undefined/"" = no border) and a custom
      // BoxStyle OBJECT are both valid and pass through. (audit 2.3)
      // `borderStyle.length > 0` (not `!== ""`): once `typeof === "string"` narrows
      // the prop to the BorderStyle keyof union, an `!== ""` literal comparison has
      // "no overlap" per TS (the union has no `""` member). The empty string is only
      // reachable via a TS-bypass; `.length > 0` excludes it without tripping that.
      //
      // We validate the RESOLVED box has a real BoxStyle SHAPE rather than testing
      // `borderStyle in cliBoxes`, because `in` has two false-accept holes that let
      // a non-box value reach paint (which then reads `.top`/`.topLeft` glyph
      // strings off it):
      //   1. cli-boxes' default export carries a CJS-interop `default` self-key, so
      //      `"default" in cliBoxes` is true — but cliBoxes.default is the WHOLE
      //      boxes object, not a BoxStyle (it has no string `top`).
      //   2. `in` walks the prototype chain, so Object.prototype members
      //      ("toString", "constructor", "hasOwnProperty", …) report as "in
      //      cliBoxes" while resolving to a function/undefined — never a BoxStyle.
      // Resolving `cliBoxes[name]` and requiring an object with a string `top`
      // rejects unknown names (undefined), "default" (whole object, no string
      // `top`), and inherited props, while accepting every real preset.
      const borderStyle = props.borderStyle;
      if (typeof borderStyle === "string" && borderStyle.length > 0) {
        // Cast via `unknown` to add a string index signature: cliBoxes is typed as
        // the `Boxes` keyof object (no index signature), so a direct cast is a TS2352
        // "insufficient overlap" error. Same cast paint.ts uses to look up by name.
        const resolved = (cliBoxes as unknown as Record<string, BoxStyle | undefined>)[borderStyle];
        if (typeof resolved !== "object" || resolved === null || typeof resolved.top !== "string") {
          throw new Error(`Unknown borderStyle: ${JSON.stringify(borderStyle)}`);
        }
      }

      const ariaLabel = props.ariaLabel;
      const label = ariaLabel ? h("text", null, ariaLabel) : undefined;

      return h("box", props as never, isScreenReaderEnabled && label ? [label] : slots.default?.());
    };
  },
});

export const Box = BoxImpl as WithChildren<typeof BoxImpl>;

/** Props accepted by `<Box>` — the vue-tui analogue of Ink's `BoxProps`. */
export type BoxProps = ExtractPublicPropTypes<typeof boxProps>;
