import cliBoxes from "cli-boxes";
import { assertValidBackgroundColor, assertValidForegroundColor } from "../paint/text-style.ts";
import type { BoxProps, BoxStyle } from "./box-props.ts";

/**
 * Eager render-time validation for `<Box>`. Runs every render and throws into the
 * error boundary on invalid input — exactly as box.ts's render fn did. Returns
 * `true` so it can gate a `v-if`. Callers must skip it for a screen-reader-hidden
 * Box (a non-emitted node never colorizes — same ordering as box.ts).
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

  return true;
}
