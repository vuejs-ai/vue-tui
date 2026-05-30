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
  type TuiRoot,
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
  markTransformDirty,
  transformHasYogaChild,
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

/** Walk up the DOM tree to find the root node. */
function findRoot(node: TuiNode): TuiRoot | null {
  let current: TuiNode | null = node;
  while (current) {
    if (current.type === "root") return current;
    current = current.parent;
  }
  return null;
}

/**
 * Walk up the DOM tree to check if we're inside a text context. Treats a
 * <Transform> as a text context too: Ink models <Transform> as an ink-text host
 * (its reconciler sets isInsideText for ink-text), so this is the vue-tui
 * equivalent of Ink's hostContext.isInsideText. It governs BOTH text-context
 * guards, exactly as Ink's single isInsideText flag does:
 *
 *  - a bare-string / <Newline> child directly inside a <Transform> is valid
 *    inline text and must NOT trip the "text must be rendered inside <Text>"
 *    guard (G58); and
 *  - a <Box> directly inside a <Transform> MUST throw the same dev error as a
 *    <Box> inside a <Text> (Ink reconciler.ts:205 throws for any isInsideText
 *    context, ink-text included) (G58 should-fix).
 */
function isInsideTextOrTransformContext(node: TuiContainer): boolean {
  let current: TuiContainer | null = node;
  while (current) {
    if (current.type === "text" || current.type === "virtual-text" || current.type === "transform")
      return true;
    current = current.parent;
  }
  return false;
}

/**
 * Find the nearest ancestor (inclusive of `start`) that OWNS the yoga measure
 * func used to size inline text — i.e. the node yoga must re-measure when a
 * descendant text-leaf changes. Mirrors Ink's findClosestYogaNode (dom.ts:248),
 * adapted for the fact that vue-tui attaches a yoga node to every <Transform>:
 *
 * - A <Text> always owns its measure func.
 * - A <Transform> owns the measure func ONLY when it is STANDALONE: it has no
 *   yoga-bearing child (so it still carries bindTransformMeasure) AND it is not
 *   itself nested in a text/transform context (an inline transform is squashed
 *   into the enclosing measure owner, just as Ink's ink-virtual-text — which has
 *   no yoga node — is climbed past). An inline transform is therefore skipped and
 *   the walk continues to the enclosing <Text>/standalone <Transform>. (G58)
 */
function findMeasureOwner(start: TuiNode | null): TuiNode | null {
  let p: TuiNode | null = start;
  while (p) {
    if (p.type === "text") return p;
    if (p.type === "transform") {
      const inlineInTextContext =
        p.parent != null &&
        isContainer(p.parent) &&
        isInsideTextOrTransformContext(p.parent as TuiContainer);
      if (!transformHasYogaChild(p) && !inlineInTextContext) return p;
    }
    p = p.parent;
  }
  return null;
}

/**
 * Dirty the measure owner of a text-context parent after a STRUCTURAL change to
 * its children (insert / remove / move). Mirrors Ink marking the parent dirty in
 * appendChildNode / insertBeforeNode / removeChildNode for ink-text AND
 * ink-virtual-text parents (dom.ts:132,165,185) then climbing to the closest
 * yoga node (findClosestYogaNode, dom.ts:248). A no-op when `parent` is not a
 * text context (box / root / static structural changes are sized by yoga
 * directly, no measure func to invalidate).
 */
function dirtyTextMeasureOwner(parent: TuiNode): void {
  if (parent.type !== "text" && parent.type !== "virtual-text" && parent.type !== "transform") {
    return;
  }
  const owner = findMeasureOwner(parent);
  if (owner?.type === "transform") markTransformDirty(owner);
  else if (owner?.type === "text") markTextDirty(owner);
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
    // Bubble dirty up to the node that OWNS the yoga measure func so yoga
    // remeasures. Mirror Ink's markNodeAsDirty → findClosestYogaNode (dom.ts:248):
    // climb to the nearest node carrying the MEASURE func and mark it. The catch
    // is that vue-tui attaches a yoga node to EVERY <Transform> (even inline ones
    // inside a <Text>), whereas Ink turns an inline transform into ink-virtual-text
    // with NO yoga node — so in Ink the climb passes THROUGH an inline transform to
    // the enclosing ink-text. A <Transform> here only owns the measure func when it
    // is STANDALONE (a text-context root with no yoga-bearing child); an inline
    // transform (inside a <Text> or another <Transform>) does NOT, so we must keep
    // climbing to the enclosing <Text>/standalone-transform measure owner. (G58)
    const owner = findMeasureOwner(node.parent as TuiNode | null);
    if (owner?.type === "text") {
      markTextDirty(owner);
    } else if (owner?.type === "transform") {
      markTransformDirty(owner);
    }
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

    // <Box> inside a text context is invalid (matches Ink's validation). Ink
    // models <Transform> as ink-text (hostContext.isInsideText), so its
    // reconciler throws the SAME error for a <Box> directly inside a <Transform>
    // as for a <Box> inside a <Text> (reconciler.ts:205,
    // `hostContext.isInsideText && originalType === 'ink-box'`). A standalone
    // <Transform> is a text context here (G58), so we use the transform-aware
    // context check to mirror Ink exactly. (G58 should-fix)
    if (child.type === "box" && isInsideTextOrTransformContext(parentC)) {
      throw new Error("<Box> can’t be nested inside <Text> component");
    }

    // Text-leaf nodes must live inside a <Text> context.
    // Skip empty text-leaves — Vue uses them as fragment anchors.
    if (
      child.type === "text-leaf" &&
      child.value !== "" &&
      (parentC.type === "box" || parentC.type === "root" || parentC.type === "static") &&
      !isInsideTextOrTransformContext(parentC)
    ) {
      throw new Error(`Text string "${child.value}" must be rendered inside <Text> component`);
    }

    // Move semantics: if the child is already mounted (Vue's keyed reorder
    // emits insert(existingChild, parent, newAnchor) without a prior remove),
    // detach it from its current DOM and yoga positions before re-inserting.
    if (child.parent) {
      const oldParent = child.parent;
      const oldIdx = oldParent.children.indexOf(child as never);
      if (oldIdx >= 0) oldParent.children.splice(oldIdx, 1);
      removeYogaChild(oldParent, child);
      // Mirror Ink's removeChildNode dirty-mark: detaching a child from a text
      // context (text / virtual-text / transform) must re-measure the OLD
      // parent's measure owner. Ink dirties on remove from the old parent AND on
      // append to the new (dom.ts:132,165,185). We dirty the old parent here
      // unconditionally; if it shares a measure owner with the new parent, the
      // post-insert dirty below just re-marks the same node (markDirty is
      // idempotent), so no skip is needed.
      dirtyTextMeasureOwner(oldParent);
    }

    const idx = anchor ? parentC.children.indexOf(anchor as never) : parentC.children.length;
    parentC.children.splice(idx < 0 ? parentC.children.length : idx, 0, child as never);
    child.parent = parentC as never;
    insertYogaChild(parentC, child, idx);

    // A text-context parent (text / virtual-text / transform) sizes its inline
    // text via a measure func; a STRUCTURAL change (adding an inline child:
    // text-leaf / virtual-text / nested transform) must re-mark the owning
    // measure node dirty so yoga re-measures. Mirror Ink, which dirties the
    // parent for ink-text AND ink-virtual-text in append/insert (dom.ts:132,165)
    // then climbs to the closest yoga node (dom.ts:248). The owner may be an
    // ANCESTOR of the immediate parent (an inline transform / virtual-text owns
    // no measure func), so resolve it via findMeasureOwner. (G58)
    dirtyTextMeasureOwner(parentC);

    // Track static node identity on the root (mirrors Ink's reconciler).
    if (child.type === "static") {
      const root = findRoot(child);
      if (root) root.staticNode = child;
    }

    onCommit();
  }

  function remove(child: TuiNode): void {
    const parent = child.parent;
    if (!parent) return;

    // Track static node removal: clear root.staticNode only if it still
    // points at this node. On key-driven remounts, insert() already
    // registered the new instance before the old one is removed.
    if (child.type === "static") {
      const root = findRoot(child);
      if (root && root.staticNode === child) {
        root.staticNode = undefined;
      }
    }

    const idx = parent.children.indexOf(child as never);
    if (idx >= 0) parent.children.splice(idx, 1);
    removeYogaChild(parent, child);
    // Free yoga nodes for this subtree (descendants first, then this node).
    freeSubtreeYoga(child);
    child.parent = null as never;
    // Re-measure the owning measure node when an inline child is removed from a
    // text context (mirror of the insert() dirty-mark; Ink dirties ink-text AND
    // ink-virtual-text parents on remove, dom.ts:185). removeYogaChild already
    // re-bound the measure func if the LAST yoga child was removed. The owner may
    // be an ancestor (nested transform / virtual-text), so resolve it via
    // findMeasureOwner. `parent` still has its own parent chain (only
    // `child.parent` was cleared), so the walk starts from the immediate
    // parent. (G58)
    dirtyTextMeasureOwner(parent);
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

  function patchProp(el: TuiNode, key: string, prev: unknown, next: unknown): void {
    if (el.type === "transform") {
      if (key === "transform" && typeof next === "function") {
        el.transform = next as (line: string, idx: number) => string;
      }
      onCommit();
      return;
    }
    if (el.type === "static" && key === "internal_onWritten") {
      // Callback the renderer invokes post-commit to advance the <Static>
      // component's cursor so written items unmount. Not styling/layout.
      el.onWritten = typeof next === "function" ? (next as () => void) : undefined;
      onCommit();
      return;
    }
    if (el.type === "box" || el.type === "text" || el.type === "static" || el.type === "root") {
      if (isYogaProp(key)) {
        applyYogaProp(el, key, next, prev);
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
      } else if (key === "aria-role" || key === "ariaRole") {
        if (el.type === "box") {
          el.internal_accessibility ??= {};
          el.internal_accessibility.role = next as string;
        }
      } else if (key === "aria-state" || key === "ariaState") {
        if (el.type === "box") {
          el.internal_accessibility ??= {};
          el.internal_accessibility.state = next as Record<string, boolean>;
        }
      } else if (
        key === "aria-label" ||
        key === "ariaLabel" ||
        key === "aria-hidden" ||
        key === "ariaHidden" ||
        key === "accessibilityLabel"
      ) {
        // Handled at the Vue component level (Box.ts / Text.ts / Transform.ts),
        // not stored on the DOM node. Silently ignore so we don't warn.
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
