import Yoga from "yoga-layout";
import type { TuiNode, TuiText, TuiVirtualText, TuiBox } from "../host/nodes.ts";

/**
 * Squash text content from a text/virtual-text node tree into plain text
 * (no ANSI styling), suitable for screen reader output.
 */
function squashTextContent(node: TuiText | TuiVirtualText): string {
  let text = "";
  // Use forEach so `index` is the child's POSITIONAL index among ALL siblings —
  // matching paint.ts renderTextWithInlineStyles and Ink squash-text-nodes.ts:13,38
  // (index is the plain loop counter over node.childNodes). A nested <Transform>
  // must receive its sibling position, not a hardcoded 0.
  node.children.forEach((child, index) => {
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
    // Skip comments
  });
  return text;
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
    // Determine separator based on flex direction
    const flexDirection =
      node.type === "box" ? (node.props["flexDirection"] as string | undefined) : undefined;

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
