import { type RendererOptions } from "@vue/runtime-core";
import {
  createBox,
  createComment as createCommentNode,
  createStatic,
  createText,
  createTextLeaf,
  createTransform,
  createVirtualText,
  isContainer,
  type TuiContainer,
  type TuiNode,
} from "./nodes.ts";
import {
  attachYoga,
  detachYoga,
  insertYogaChild,
  removeYogaChild,
  applyYogaProp,
  isYogaProp,
  bindTextMeasure,
  markTextDirty,
} from "./yoga.ts";

export interface TtyRendererOptions {
  onCommit: () => void;
}

const STYLE_PROPS = new Set([
  "color",
  "backgroundColor",
  "dimColor",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "inverse",
  "wrap",
  // Border visual style — also a yoga prop (sets border widths); stored here
  // so the paint pass can look up borderStyle from el.props.
  "borderStyle",
  "borderColor",
  "borderDimColor",
  "borderTopColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderRightColor",
  "borderTopDimColor",
  "borderBottomDimColor",
  "borderLeftDimColor",
  "borderRightDimColor",
  "borderBackgroundColor",
  "borderTopBackgroundColor",
  "borderBottomBackgroundColor",
  "borderLeftBackgroundColor",
  "borderRightBackgroundColor",
  // Per-edge toggles are dual: yoga uses them to size border space, paint
  // uses them to decide which edges to draw.
  "borderTop",
  "borderBottom",
  "borderLeft",
  "borderRight",
  // Overflow is a yoga prop (setOverflow) but also needed by the paint pass
  // to set up clip rects for overflow: hidden containers.
  "overflow",
  "overflowX",
  "overflowY",
]);

/** Walk up the DOM tree to check if we're inside a text or virtual-text context. */
function isInsideTextContext(node: TuiContainer): boolean {
  let current: TuiContainer | null = node;
  while (current) {
    if (current.type === "text" || current.type === "virtual-text") return true;
    current = current.parent;
  }
  return false;
}

export function buildNodeOps(options: TtyRendererOptions): RendererOptions<TuiNode, TuiNode> {
  const { onCommit } = options;

  function createElement(type: string): TuiNode {
    switch (type) {
      case "box": {
        const n = createBox();
        attachYoga(n);
        return n;
      }
      case "text": {
        const n = createText();
        attachYoga(n);
        bindTextMeasure(n);
        return n;
      }
      case "virtual-text":
        return createVirtualText();
      case "static": {
        const n = createStatic();
        attachYoga(n);
        return n;
      }
      case "transform": {
        const n = createTransform((line) => line); // overwritten by patchProp
        attachYoga(n);
        return n;
      }
      default:
        throw new Error(`Unknown vue-tui element type: ${type}`);
    }
  }

  function createTextNode(text: string): TuiNode {
    return createTextLeaf(text);
  }

  function setText(node: TuiNode, text: string): void {
    if (node.type !== "text-leaf") {
      throw new Error(`Cannot setText on ${node.type}`);
    }
    node.value = text;
    // Bubble dirty up to nearest TuiText so yoga remeasures.
    let p = node.parent;
    while (p && p.type !== "text") p = p.parent;
    if (p) markTextDirty(p);
    onCommit();
  }

  function setElementText(el: TuiNode, text: string): void {
    if (!isContainer(el)) return;
    // Remove existing children first (copy since remove mutates the array).
    for (const child of Array.from(el.children)) remove(child);
    insert(createTextLeaf(text), el, null);
    if (el.type === "text") {
      markTextDirty(el);
    }
  }

  function insert(child: TuiNode, parent: TuiNode, anchor: TuiNode | null): void {
    if (!isContainer(parent)) {
      throw new Error(`Cannot insert into ${parent.type}`);
    }
    const parentC = parent as TuiContainer;

    // Dev warning: <Box> inside <Text> is invalid (matches Ink's validation).
    // Inserting a box into a text context corrupts the yoga WASM layout engine.
    if (
      process.env["NODE_ENV"] !== "production" &&
      child.type === "box" &&
      isInsideTextContext(parentC)
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        "[vue-tui] A <Box> cannot be nested inside a <Text> component. " +
          "Wrap it in a sibling <Box> instead.",
      );
      return; // Skip insertion to prevent WASM crash
    }

    // Move semantics: if the child is already mounted (Vue's keyed reorder
    // emits insert(existingChild, parent, newAnchor) without a prior remove),
    // detach it from its current DOM and yoga positions before re-inserting.
    if (child.parent) {
      const oldParent = child.parent;
      const oldIdx = oldParent.children.indexOf(child as never);
      if (oldIdx >= 0) oldParent.children.splice(oldIdx, 1);
      removeYogaChild(oldParent, child);
    }

    const idx = anchor ? parentC.children.indexOf(anchor as never) : parentC.children.length;
    parentC.children.splice(idx < 0 ? parentC.children.length : idx, 0, child as never);
    child.parent = parentC as never;
    insertYogaChild(parentC, child, idx);
    onCommit();
  }

  function remove(child: TuiNode): void {
    const parent = child.parent;
    if (!parent) return;
    const idx = parent.children.indexOf(child as never);
    if (idx >= 0) parent.children.splice(idx, 1);
    removeYogaChild(parent, child);
    // Free yoga nodes for this subtree (descendants first, then this node).
    freeSubtreeYoga(child);
    child.parent = null as never;
    onCommit();
  }

  /** Recursively free yoga nodes for all yoga-carrying descendants, then the node itself. */
  function freeSubtreeYoga(node: TuiNode): void {
    if (isContainer(node)) {
      for (const child of (node as { children: TuiNode[] }).children) {
        freeSubtreeYoga(child);
      }
    }
    if (
      node.type === "box" ||
      node.type === "text" ||
      node.type === "static" ||
      node.type === "transform"
    ) {
      detachYoga(node);
    }
  }

  function parentNode(node: TuiNode): TuiNode | null {
    return node.parent ?? null;
  }

  function nextSibling(node: TuiNode): TuiNode | null {
    const p = node.parent;
    if (!p) return null;
    const i = p.children.indexOf(node as never);
    if (i < 0) return null;
    return (p.children[i + 1] as TuiNode | undefined) ?? null;
  }

  function patchProp(el: TuiNode, key: string, _prev: unknown, next: unknown): void {
    if (el.type === "transform") {
      if (key === "transform" && typeof next === "function") {
        el.transform = next as (line: string, idx: number) => string;
      }
      onCommit();
      return;
    }
    if (el.type === "box" || el.type === "text" || el.type === "static" || el.type === "root") {
      if (isYogaProp(key)) {
        applyYogaProp(el, key, next);
        // Some yoga props also need to be stored in el.props for the paint pass.
        if (STYLE_PROPS.has(key)) {
          (el as { props: Record<string, unknown> }).props[key] = next;
        }
        // Special case: borderStyle resets all four yoga border-edge widths to
        // 1 (or 0). If per-edge toggles (borderTop/Bottom/Left/Right) were
        // already applied before this patch, their values were clobbered.
        // Re-apply any per-edge toggles that are stored in el.props so that
        // yoga reflects the user's explicit per-edge settings.
        //
        // Only re-apply when `next` is truthy (i.e. a border style is actually
        // being set). When borderStyle is cleared/undefined, applyYogaProp sets
        // all edges to 0 which is the correct final state — there is nothing to
        // restore, and re-applying per-edge defaults (e.g. borderTop:true from
        // Box component defaults) would incorrectly reserve border space even
        // though no border is drawn.
        if (key === "borderStyle" && next) {
          const props = (el as { props: Record<string, unknown> }).props;
          for (const edge of ["borderTop", "borderBottom", "borderLeft", "borderRight"] as const) {
            if (props[edge] !== undefined) {
              applyYogaProp(el, edge, props[edge]);
            }
          }
        }
      } else if (STYLE_PROPS.has(key)) {
        (el as { props: Record<string, unknown> }).props[key] = next;
      } else if (key === "key" || key === "ref" || key.startsWith("on")) {
        // Reserved by Vue / event keys, ignore.
      } else if (process.env["NODE_ENV"] !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[vue-tui] unknown prop "${key}" on <${el.type}>`);
      }
      onCommit();
      return;
    }
    if (el.type === "virtual-text" && STYLE_PROPS.has(key)) {
      (el.props as Record<string, unknown>)[key] = next;
      onCommit();
    }
  }

  const nodeOps: RendererOptions<TuiNode, TuiNode> = {
    createElement: createElement as never,
    createText: createTextNode as never,
    createComment: (text: string) => createCommentNode(text) as never,
    setText: setText as never,
    setElementText: setElementText as never,
    patchProp: patchProp as never,
    insert: insert as never,
    remove: remove as never,
    parentNode: parentNode as never,
    nextSibling: nextSibling as never,
    querySelector: () => null,
    setScopeId: () => {},
    cloneNode: () => {
      throw new Error("cloneNode not supported by @vue-tui/runtime");
    },
    insertStaticContent: () => {
      throw new Error("insertStaticContent not supported by @vue-tui/runtime");
    },
  };

  return nodeOps;
}
