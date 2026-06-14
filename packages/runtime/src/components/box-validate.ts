import cliBoxes from "cli-boxes";
import { assertValidBackgroundColor, assertValidForegroundColor } from "../paint/text-style.ts";
import type { BoxProps, BoxStyle } from "./box-props.ts";

// The exact glyph keys paint's drawBorder reads off a resolved BoxStyle:
// `top`/`bottom`/`left`/`right` are read unconditionally for any drawn edge, and
// the four corners are read when their adjacent sides are drawn (edges default to
// drawn). Validating ALL of them here guarantees no malformed object can reach
// paint and throw `<glyph>.repeat(...)` / string-concat a non-string mid-commit,
// regardless of which per-edge toggles are set. Keep in sync with drawBorder.
const BOX_STYLE_GLYPHS = [
  "top",
  "bottom",
  "left",
  "right",
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
] as const;

/**
 * True only when `value` is a real BoxStyle: an object carrying every glyph
 * paint reads, each a string. Rejects undefined (unknown preset name), the
 * cli-boxes `default` self-key / prototype members (objects without string
 * glyphs), partial custom objects, and truthy non-objects (e.g. a number).
 */
function isValidBoxStyleShape(value: unknown): value is BoxStyle {
  if (typeof value !== "object" || value === null) return false;
  const box = value as Record<string, unknown>;
  return BOX_STYLE_GLYPHS.every((glyph) => typeof box[glyph] === "string");
}

/**
 * Eager render-time validation for `<Box>`. Runs every render and throws into the
 * error boundary on invalid input — exactly as box.ts's render fn did. Returns
 * `true` so it can gate a `v-if`.
 *
 * Everything validated here is PAINT-TIME VISUAL input (own/border background colors,
 * per-edge border foreground colors, borderStyle shape) — it only matters when the
 * Box is actually painted. There is no structural validation here. So callers must
 * skip it whenever the Box's visuals are never painted:
 *   - a screen-reader-HIDDEN Box (a non-emitted node never colorizes — same ordering
 *     as box.ts), and
 *   - GLOBAL screen-reader mode (the whole tree is linearized to plain text; vue-tui,
 *     like Ink, never colorizes / draws borders for ANY node, so it never throws on an
 *     invalid color — verified against Ink v7.0.4). See box.vue's v-if.
 */
export function assertBoxValid(props: BoxProps): true {
  // --- backgroundColor validation (A12) ---
  //
  // Validate the bg-style props during RENDER so a chalk-modifier name (the
  // exact case Ink's colorize.ts throws on) is caught by vue-tui's error
  // boundary, not the post-flush paint pass where a throw wedges Vue's
  // scheduler (cf. the borderStyle fix #124). See assertValidBackgroundColor /
  // Ink colorize.ts (40b3a75).
  //
  // Placed AFTER the screen-reader-hidden early-return to mirror Ink WHERE it
  // throws: Ink's render-node-to-output never reaches render-background /
  // render-border for a node it didn't emit, and a screen-reader-hidden Box
  // emits nothing — so colorize never runs for it. Below, we additionally
  // gate each value the way Ink's renderers do, so vue throws exactly where
  // Ink would colorize, and not elsewhere.

  // Box's OWN backgroundColor: Ink's render-background.ts only colorizes when
  // the resolved content area is > 0 (after subtracting drawn borders); it
  // bails early otherwise. We can't know the content area at render time
  // (layout hasn't run), so we validate eagerly. ACCEPTED tiny over-throw: a
  // degenerate-size Box (content area <= 0, e.g. width/height collapses to
  // border-only or 0) with a chalk-modifier-name backgroundColor throws here
  // where Ink would silently skip the fill. This is a niche case on
  // clearly-invalid input (a modifier name is never a valid bg); matching
  // Ink's layout-time gate at render time is not worth the complexity.
  assertValidBackgroundColor(props.backgroundColor);

  // Border backgrounds: Ink's render-border.ts only colorizes a border bg
  // when (a) borderStyle is truthy (line 28 gate) AND (b) the specific edge
  // is DRAWN (`border<Edge> !== false`), and the value it passes per edge is
  // `border<Edge>BackgroundColor ?? borderBackgroundColor` (the per-edge
  // value with the general value as fallback — lines 44-52, 80/100/112/126).
  // So we validate exactly the resolved bg of each DRAWN edge — never the
  // general value on its own, and never an edge whose border isn't drawn.
  // Consequences (matching Ink, not over-throwing):
  //   - no borderStyle → no border colorize at all → nothing validated.
  //   - borderTop={false} → top edge not drawn → its resolved bg not checked.
  //   - a bad general borderBackgroundColor but every DRAWN edge overrides it
  //     with a valid per-edge value → general value never reaches colorize →
  //     not validated → no throw.
  // ACCEPTED irreducible over-throw (same class as the content-area note
  // above): top/bottom edge bg is validated eagerly, but Ink only colorizes a
  // top/bottom border string when it's non-empty — a degenerate box (e.g.
  // width=0 with no left/right border) produces an empty string Ink skips.
  // Matching that needs layout, unavailable at render. Niche + invalid-input-only.
  if (props.borderStyle) {
    const stringStyle = (value: unknown) => (typeof value === "string" ? value : undefined);
    const generalBg = stringStyle(props.borderBackgroundColor);
    // Per-edge foreground: Ink's render-border colorizes each drawn edge's glyphs
    // with `border<Edge>Color ?? borderColor` (the same per-edge-with-general
    // fallback as the bg path). A foreground name chalk has but can't call (e.g.
    // "level") throws there; we validate it eagerly per DRAWN edge.
    const generalFg = stringStyle(props.borderColor);
    if (props.borderTop !== false) {
      assertValidForegroundColor(stringStyle(props.borderTopColor) ?? generalFg, "borderTopColor");
      assertValidBackgroundColor(
        stringStyle(props.borderTopBackgroundColor) ?? generalBg,
        "borderTopBackgroundColor",
      );
    }
    if (props.borderBottom !== false) {
      assertValidForegroundColor(
        stringStyle(props.borderBottomColor) ?? generalFg,
        "borderBottomColor",
      );
      assertValidBackgroundColor(
        stringStyle(props.borderBottomBackgroundColor) ?? generalBg,
        "borderBottomBackgroundColor",
      );
    }
    if (props.borderLeft !== false) {
      assertValidForegroundColor(
        stringStyle(props.borderLeftColor) ?? generalFg,
        "borderLeftColor",
      );
      assertValidBackgroundColor(
        stringStyle(props.borderLeftBackgroundColor) ?? generalBg,
        "borderLeftBackgroundColor",
      );
    }
    if (props.borderRight !== false) {
      assertValidForegroundColor(
        stringStyle(props.borderRightColor) ?? generalFg,
        "borderRightColor",
      );
      assertValidBackgroundColor(
        stringStyle(props.borderRightBackgroundColor) ?? generalBg,
        "borderRightBackgroundColor",
      );
    }
  }

  // NOTE: this component-level validation covers the public `<Box>`/`<Text>`
  // API only. A raw host-op call (`h("tui-box", { backgroundColor: "bold" })`)
  // bypasses it; the paint layer keeps its silent degrade-to-bare-text there
  // rather than throwing (a throw in the post-flush paint pass wedges Vue's
  // scheduler). Same accepted limitation as the borderStyle fix (#124).

  // Validate borderStyle during RENDER so an invalid value is caught by
  // vue-tui's error boundary (onErrorCaptured → ErrorOverview), exactly like
  // any other component render error. Ink crashes on an unknown borderStyle
  // with a raw TypeError during paint (render-border.ts reads box.topLeft off
  // cliBoxes[name] === undefined); we align to that "throw on bad input"
  // contract but do it here rather than in paint, where a throw would unwind
  // through Vue's post-flush commit and wedge its scheduler. A falsy value
  // (false/undefined/"" = no border) is valid and passes through. (audit 2.3)
  //
  // borderStyle has TWO valid prop forms (Ink types it `keyof Boxes | BoxStyle`):
  // a preset-name STRING, or a custom BoxStyle OBJECT. We resolve the value to a
  // BoxStyle exactly the way paint's drawBorder does — string → cliBoxes[name],
  // object → use directly — then shape-check the RESULT. Both forms must produce
  // a real BoxStyle so paint never reads a glyph off a malformed value.
  //
  // Why shape-check the RESOLVED box rather than `borderStyle in cliBoxes`: `in`
  // has two false-accept holes that let a non-box value reach paint (which then
  // reads `.top`/`.topLeft` glyph strings off it):
  //   1. cli-boxes' default export carries a CJS-interop `default` self-key, so
  //      `"default" in cliBoxes` is true — but cliBoxes.default is the WHOLE
  //      boxes object, not a BoxStyle (it has no string `top`).
  //   2. `in` walks the prototype chain, so Object.prototype members
  //      ("toString", "constructor", "hasOwnProperty", …) report as "in
  //      cliBoxes" while resolving to a function/undefined — never a BoxStyle.
  // Resolving and requiring a real BoxStyle shape rejects unknown names
  // (undefined), "default" (whole object), and inherited props.
  //
  // Why this also covers the OBJECT form: previously only the STRING form was
  // shape-checked, so a malformed custom OBJECT (missing `top`, or a truthy
  // non-string non-object like a number from a JS caller) bypassed validation,
  // reached drawBorder, and threw `Cannot read properties of undefined (reading
  // 'repeat')` in the post-flush PAINT pass — wedging Vue's scheduler. Resolving
  // both forms and shape-checking here routes every invalid value to a clean
  // render-time error instead.
  const borderStyle = props.borderStyle;
  // Truthy gate: empty string / undefined / false ("no border") pass through
  // unchanged, matching paint's `if (!style) return`.
  if (borderStyle) {
    if (typeof borderStyle === "string") {
      // Cast via `unknown` to add a string index signature: cliBoxes is typed as
      // the `Boxes` keyof object (no index signature), so a direct cast is a
      // TS2352 "insufficient overlap" error. Same cast paint.ts uses by name.
      const resolved = (cliBoxes as unknown as Record<string, BoxStyle | undefined>)[borderStyle];
      // Preserve the existing "Unknown borderStyle" wording for the string case.
      if (!isValidBoxStyleShape(resolved)) {
        throw new Error(`Unknown borderStyle: ${JSON.stringify(borderStyle)}`);
      }
    } else if (!isValidBoxStyleShape(borderStyle)) {
      // Object form (or a truthy non-string non-object, e.g. a number from a JS
      // caller): if it isn't a real BoxStyle, reject at render rather than let
      // paint read a missing glyph and throw mid-commit.
      throw new Error(`Invalid borderStyle: ${JSON.stringify(borderStyle)}`);
    }
  }

  return true;
}
