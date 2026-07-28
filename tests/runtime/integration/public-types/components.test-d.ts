import { expectTypeOf } from "vite-plus/test";
import type { BoxProps, Color, TextProps } from "@vue-tui/runtime";

// Prop types carry their component's real, declared props.
expectTypeOf<keyof BoxProps>().toEqualTypeOf<
  | "flexDirection"
  | "flexWrap"
  | "flexGrow"
  | "flexShrink"
  | "flexBasis"
  | "alignItems"
  | "alignSelf"
  | "alignContent"
  | "justifyContent"
  | "gap"
  | "rowGap"
  | "columnGap"
  | "width"
  | "height"
  | "minWidth"
  | "minHeight"
  | "maxWidth"
  | "maxHeight"
  | "aspectRatio"
  | "position"
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "margin"
  | "marginX"
  | "marginY"
  | "marginTop"
  | "marginRight"
  | "marginBottom"
  | "marginLeft"
  | "padding"
  | "paddingX"
  | "paddingY"
  | "paddingTop"
  | "paddingRight"
  | "paddingBottom"
  | "paddingLeft"
  | "borderStyle"
  | "borderTop"
  | "borderRight"
  | "borderBottom"
  | "borderLeft"
  | "borderColor"
  | "borderTopColor"
  | "borderRightColor"
  | "borderBottomColor"
  | "borderLeftColor"
  | "borderDimColor"
  | "borderTopDimColor"
  | "borderRightDimColor"
  | "borderBottomDimColor"
  | "borderLeftDimColor"
  | "borderBackgroundColor"
  | "borderTopBackgroundColor"
  | "borderRightBackgroundColor"
  | "borderBottomBackgroundColor"
  | "borderLeftBackgroundColor"
  | "backgroundColor"
  | "overflow"
  | "overflowX"
  | "overflowY"
>();
expectTypeOf<keyof TextProps>().toEqualTypeOf<
  | "color"
  | "backgroundColor"
  | "dimColor"
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "inverse"
  | "wrap"
>();
expectTypeOf<BoxProps["flexDirection"]>().toEqualTypeOf<
  "row" | "column" | "row-reverse" | "column-reverse" | undefined
>();
expectTypeOf<BoxProps["flexWrap"]>().toEqualTypeOf<
  "nowrap" | "wrap" | "wrap-reverse" | undefined
>();
expectTypeOf<BoxProps["alignItems"]>().toEqualTypeOf<
  "flex-start" | "center" | "flex-end" | "stretch" | undefined
>();
expectTypeOf<BoxProps["alignSelf"]>().toEqualTypeOf<
  "auto" | "flex-start" | "center" | "flex-end" | "stretch" | undefined
>();
expectTypeOf<BoxProps["justifyContent"]>().toEqualTypeOf<
  | "flex-start"
  | "center"
  | "flex-end"
  | "space-between"
  | "space-around"
  | "space-evenly"
  | undefined
>();
expectTypeOf<BoxProps["width"]>().toEqualTypeOf<number | `${number}%` | undefined>();
expectTypeOf<BoxProps["flexBasis"]>().toEqualTypeOf<number | `${number}%` | undefined>();
expectTypeOf<BoxProps["height"]>().toEqualTypeOf<number | undefined>();
expectTypeOf<BoxProps["position"]>().toEqualTypeOf<
  "relative" | "absolute" | "static" | undefined
>();
expectTypeOf<BoxProps["right"]>().toEqualTypeOf<number | `${number}%` | undefined>();
type BorderStyleValue = NonNullable<BoxProps["borderStyle"]>;
expectTypeOf<Extract<BorderStyleValue, string>>().toEqualTypeOf<
  "single" | "double" | "round" | "bold" | "singleDouble" | "doubleSingle" | "classic" | "arrow"
>();
// A custom frame must supply every corner and edge.
expectTypeOf<keyof Extract<BorderStyleValue, object>>().toEqualTypeOf<
  "topLeft" | "top" | "topRight" | "right" | "bottomRight" | "bottom" | "bottomLeft" | "left"
>();
expectTypeOf<BoxProps["borderTopColor"]>().toEqualTypeOf<Color | undefined>();
expectTypeOf<BoxProps["borderLeftBackgroundColor"]>().toEqualTypeOf<Color | undefined>();
expectTypeOf<BoxProps["borderBottomDimColor"]>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<BoxProps["aspectRatio"]>().toEqualTypeOf<number | undefined>();
expectTypeOf<BoxProps["borderTop"]>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<BoxProps["overflow"]>().toEqualTypeOf<"visible" | "hidden" | undefined>();
expectTypeOf<BoxProps["overflowY"]>().toEqualTypeOf<"visible" | "hidden" | undefined>();
expectTypeOf<BoxProps["gap"]>().toEqualTypeOf<number | undefined>();
expectTypeOf<TextProps["bold"]>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<TextProps["color"]>().toEqualTypeOf<Color | "default" | undefined>();
expectTypeOf<TextProps["backgroundColor"]>().toEqualTypeOf<Color | "default" | undefined>();
expectTypeOf<TextProps["wrap"]>().toEqualTypeOf<
  "wrap" | "hard" | "truncate" | "truncate-middle" | "truncate-start" | undefined
>();
expectTypeOf<BoxProps["backgroundColor"]>().toEqualTypeOf<Color | undefined>();
expectTypeOf<BoxProps["borderColor"]>().toEqualTypeOf<Color | undefined>();

const namedColor: Color = "gray";
const rgbColor: Color = "#12abEF";
// @ts-expect-error British spelling is not a canonical Runtime color.
const invalidGrey: Color = "grey";
// @ts-expect-error blackBright is not a second name for the canonical gray entry.
const invalidBlackBright: Color = "blackBright";
void namedColor;
void rgbColor;
void invalidGrey;
void invalidBlackBright;
