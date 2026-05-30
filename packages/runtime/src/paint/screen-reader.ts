import Yoga from "yoga-layout";
import type { TuiNode, TuiText, TuiVirtualText, TuiBox } from "../host/nodes.ts";

/**
 * Squash text content from a text/virtual-text node tree into plain text
 * (no ANSI styling), suitable for screen reader output.
 */
function squashTextContent(node: TuiText | TuiVirtualText): string {
  let text = "";
  // `index` advances only for children React would have produced as DOM
  // childNodes — matching paint.ts renderTextWithInlineStyles and Ink
  // squash-text-nodes.ts:13 (the loop position over node.childNodes). Vue
  // materializes null/v-if/false renders as COMMENT host nodes that occupy a
  // positional slot in node.children, but React skips null children, so comments
  // must NOT advance the index. Staying in lockstep with paint/measure keeps the
  // <Transform> second argument identical across all three squash paths (G52).
  // A real nested <Transform> still receives its sibling position (G21).
  let index = 0;
  for (const child of node.children) {
    if (child.type === "text-leaf") {
      text += child.value;
    } else if (child.type === "virtual-text") {
      text += squashTextContent(child);
    } else if (child.type === "transform") {
      // Recurse into transform children, then apply the transform function.
      let innerText = "";
      for (const grandchild of child.children) {
        if (grandchild.type === "text-leaf") {
          innerText += grandchild.value;
        } else if (grandchild.type === "virtual-text" || grandchild.type === "text") {
          innerText += squashTextContent(grandchild);
        }
      }
      if (innerText.length > 0 && child.transform) {
        innerText = child.transform(innerText, index);
      }
      text += innerText;
    }
    // Comments (Vue's null/v-if/false renders) contribute nothing and, like
    // React's absent childNodes, must NOT advance the transform index.
    if (child.type !== "comment") index++;
  }
  return text;
}

/**
 * Resolve a box node's flexDirection as the string form the SR separator logic
 * compares against ("row" | "row-reverse" | "column" | "column-reverse").
 *
 * Prefer an explicit `props.flexDirection` when present (used by unit-test
 * fixtures that build nodes directly without a live yoga layout), otherwise read
 * the resolved direction back from the yoga node. node-ops applies flexDirection
 * to yoga but does NOT mirror it into `props` (it is not in STYLE_PROPS), and the
 * yoga node holds the Box default of row (host/yoga.ts sets FLEX_DIRECTION_ROW).
 * Mirrors static-channel.ts's resolvedFlexDirection so both SR linearization
 * paths derive the separator identically. (Ink parity, G39.)
 */
function resolveBoxFlexDirection(node: TuiBox): string {
  const fromProps = node.props["flexDirection"] as string | undefined;
  if (fromProps !== undefined) {
    return fromProps;
  }
  switch (node.yoga.getFlexDirection()) {
    case Yoga.FLEX_DIRECTION_ROW:
      return "row";
    case Yoga.FLEX_DIRECTION_ROW_REVERSE:
      return "row-reverse";
    case Yoga.FLEX_DIRECTION_COLUMN_REVERSE:
      return "column-reverse";
    default:
      return "column";
  }
}

export interface ScreenReaderOptions {
  parentRole?: string;
  skipStaticElements?: boolean;
}

/**
 * Render a TUI node tree to a plain-text string suitable for screen readers.
 *
 * Ported from Ink's `renderNodeToScreenReaderOutput`.
 *
 * - `display: none` nodes are skipped.
 * - Text nodes have their content squashed (no ANSI).
 * - Box/root nodes recursively render children, joined by separator based on flexDirection.
 * - Nodes with `internal_accessibility` get role and state info prepended.
 */
export function renderScreenReaderOutput(node: TuiNode, options: ScreenReaderOptions = {}): string {
  // Skip static elements if requested
  if (options.skipStaticElements && node.type === "static") {
    return "";
  }

  // If display: none, return empty
  if (
    (node.type === "box" ||
      node.type === "text" ||
      node.type === "root" ||
      node.type === "transform") &&
    node.yoga.getDisplay() === Yoga.DISPLAY_NONE
  ) {
    return "";
  }

  let output = "";

  if (node.type === "text") {
    output = squashTextContent(node);
  } else if (node.type === "box" || node.type === "root") {
    // Determine separator based on flex direction (resolved from yoga so the
    // Box default of row yields a space separator, matching Ink — see
    // resolveBoxFlexDirection / G39). Root keeps undefined → "\n" (Ink's column
    // default root).
    const flexDirection = node.type === "box" ? resolveBoxFlexDirection(node as TuiBox) : undefined;

    const separator = flexDirection === "row" || flexDirection === "row-reverse" ? " " : "\n";

    // Reverse children for reverse flex directions
    const children =
      flexDirection === "row-reverse" || flexDirection === "column-reverse"
        ? [...node.children].reverse()
        : node.children;

    const boxNode = node as TuiBox;
    // Ink parity (G22): pass only the CURRENT node's own role to children —
    // no `?? options.parentRole` fallback. When this box has no role, `undefined`
    // is forwarded, resetting the inherited parentRole so a grandchild with the
    // same role as its grandparent is NOT wrongly deduped (dedup is immediate-
    // parent-only, matching Ink render-node-to-output.ts:68-69).
    const parentRole = boxNode.internal_accessibility?.role;

    output = children
      .map((childNode) =>
        renderScreenReaderOutput(childNode, {
          parentRole: parentRole,
          skipStaticElements: options.skipStaticElements,
        }),
      )
      .filter(Boolean)
      .join(separator);
  } else if (node.type === "transform") {
    // Transform nodes: CONCATENATE children with "" (not newline-join), matching
    // Ink's squashTextNodes (squash-text-nodes.ts:42, `text += nodeText`). In Ink
    // a <Transform> is an `ink-text` node, so the SR path squashes it via
    // squashTextNodes which concatenates child text with "".
    //
    // The transform's OWN fn is intentionally NOT applied here. Verified
    // empirically against Ink 7.0.4: squashTextNodes only applies the
    // internal_transform of *child* nodes (squash-text-nodes.ts:34-39), never of
    // the top-level node it is handed. When a <Transform> is a direct child of a
    // <Box>, the SR renderer calls squashTextNodes(transformNode) directly, so
    // the transform node's own internal_transform is skipped — yielding the bare
    // concatenated children. A nested <Transform> inside a <Text> DOES get its
    // transform applied (see squashTextContent above), because there it is a
    // *child* being squashed by its parent text node.
    const children = node.children;
    output = children
      .map((childNode) =>
        renderScreenReaderOutput(childNode, {
          parentRole: options.parentRole,
          skipStaticElements: options.skipStaticElements,
        }),
      )
      .filter(Boolean)
      .join("");
  }

  // Add accessibility annotations
  if (node.type === "box") {
    const accessibility = node.internal_accessibility;
    if (accessibility) {
      const { role, state } = accessibility;

      if (state) {
        const stateKeys = Object.keys(state) as Array<keyof typeof state>;
        const stateDescription = stateKeys.filter((key) => state[key]).join(", ");

        if (stateDescription) {
          output = `(${stateDescription}) ${output}`;
        }
      }

      if (role && role !== options.parentRole) {
        output = `${role}: ${output}`;
      }
    }
  }

  return output;
}
