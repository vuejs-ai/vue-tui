import { type RendererOptions } from "vue";
import {
  createBox,
  createComment as createCommentNode,
  createStatic,
  createText,
  createTextLeaf,
  createVirtualText,
  isContainer,
  NESTED_STATIC_ERROR,
  type TuiBox,
  type TuiContainer,
  type TuiNode,
  type TuiText,
  type TuiVirtualText,
} from "../host/nodes.ts";
import {
  insertYogaChild,
  removeYogaChild,
  applyYogaProp,
  isYogaProp,
  BORDER_PROPS,
  reconcileBorderEdges,
  GUTTER_PROPS,
  MARGIN_PROPS,
  PADDING_PROPS,
  reconcileGutters,
  reconcileMarginEdges,
  reconcilePaddingEdges,
  bindTextMeasure,
  markTextContentDirty,
  markTextDirty,
} from "../layout/yoga.ts";
import {
  createHostYogaLifecycle,
  type HostYogaLifecycle,
  type HostYogaNode,
} from "../layout/yoga-allocation-ledger.ts";

export interface TtyRendererOptions {
  onCommit: () => void;
  /** Session invalidates ref-bound behavior before the renderer detaches a host subtree. */
  invalidateRenderedSubtree?: (target: TuiNode) => void;
  /** Host policy supplied by the terminal/session boundary. */
  isProduction?: () => boolean;
  /**
   * Optional render-local engine lifetime. The string and live renderers use
   * its ledger form to release hosts an interrupted initial patch allocated
   * before attaching them to the root.
   */
  hostYogaLifecycle?: HostYogaLifecycle;
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
  "textAlign",
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
  // Gap is another shorthand family whose physical axes must reconcile from
  // the complete current prop set.
  "gap",
  "rowGap",
  "columnGap",
  // Margin/padding families are yoga-only (not visual), but each physical edge
  // depends on up to three of these props together, so reconcileMargin/PaddingEdges
  // must read the full set from el.props. Storing them here is how they get there;
  // no paint-pass consumer reads margin/padding from el.props (verified), so this
  // is purely the reconcile's data source — same role STYLE_PROPS plays for the
  // border per-edge toggles above.
  "margin",
  "marginX",
  "marginY",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "padding",
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
]);

/**
 * Walk up the DOM tree to check if we're inside a text context. A bare-string
 * / nested <Text> child is valid inline text only under <Text> / virtual-text;
 * a <Box> directly inside a <Text> must throw a clear nesting error.
 */
function isInsideTextContext(node: TuiContainer): boolean {
  let current: TuiContainer | null = node;
  while (current) {
    if (current.type === "tui-text" || current.type === "tui-virtual-text") return true;
    current = current.parent;
  }
  return false;
}

function isInsideStaticContext(node: TuiNode | null): boolean {
  let current = node;
  while (current) {
    if (current.type === "tui-static") return true;
    current = current.parent;
  }
  return false;
}

function hasNestedStatic(node: TuiNode, staticAncestor: boolean): boolean {
  const nextStaticAncestor = staticAncestor || node.type === "tui-static";
  if (node.type === "tui-static" && staticAncestor) return true;
  if (!isContainer(node)) return false;
  return node.children.some((child) => hasNestedStatic(child, nextStaticAncestor));
}

/**
 * Find the nearest ancestor (inclusive of `start`) that OWNS the yoga measure
 * function used to size inline text. A <Text> owns its measure function;
 * virtual-text is climbed past to the enclosing <Text>.
 */
function findMeasureOwner(start: TuiNode | null): TuiNode | null {
  let p: TuiNode | null = start;
  while (p) {
    if (p.type === "tui-text") return p;
    p = p.parent;
  }
  return null;
}

/**
 * Dirty the measure owner of a text-context parent after a structural child
 * change (insert, remove, or move), then climb through virtual-text to the
 * enclosing Text. A no-op when `parent` is not a text context because Box, root,
 * and Static structural changes are sized directly by Yoga, with no measure
 * function to invalidate).
 */
function dirtyTextMeasureOwner(parent: TuiNode): void {
  if (parent.type !== "tui-text" && parent.type !== "tui-virtual-text") {
    return;
  }
  const owner = findMeasureOwner(parent);
  if (owner?.type === "tui-text") markTextContentDirty(owner);
}

/**
 * Whether a text-leaf carrying `value` would be REJECTED by the text-context
 * guard if inserted into `parent`. A bare string must live inside a <Text>
 * context; an EMPTY text-leaf is exempt (Vue uses empty text-leaves as fragment
 * anchors / its common clear path). Shared by `insert()` (its existing guard)
 * and `setElementText()` (its pre-remove validation) so the two cannot drift —
 * the condition must stay identical in both call sites.
 */
function rejectsTextLeaf(parent: TuiContainer, value: string): boolean {
  return (
    value !== "" &&
    (parent.type === "tui-box" || parent.type === "root" || parent.type === "tui-static") &&
    !isInsideTextContext(parent)
  );
}

export function buildNodeOps(options: TtyRendererOptions): RendererOptions<TuiNode, TuiNode> {
  const { onCommit } = options;
  const hostYogaLifecycle = options.hostYogaLifecycle ?? createHostYogaLifecycle();

  interface BoxDisplayController {
    setAuthoredDisplay(value: unknown): void;
    dispose(): void;
  }

  interface TextDisplayController {
    dispose(): void;
  }

  const boxDisplayControllers = new WeakMap<TuiBox, BoxDisplayController>();
  const textDisplayControllers = new WeakMap<TuiText | TuiVirtualText, TextDisplayController>();

  function disposeHostYoga(node: HostYogaNode): void {
    hostYogaLifecycle.detach(node);
  }

  function attachHostYoga(node: HostYogaNode): void {
    hostYogaLifecycle.attach(node, () => {
      if (node.type === "tui-box") {
        // A retained host ref may outlive Vue's unmount. Make later
        // style.display writes inert before freeing its Yoga allocation.
        boxDisplayControllers.get(node)?.dispose();
      }
      if (node.type === "tui-text") {
        textDisplayControllers.get(node)?.dispose();
      }
    });
  }

  /**
   * Install the minimal DOM-style contract Vue's built-in `v-show` directive
   * requires. Runtime-dom reads and writes `el.style.display`; the custom host
   * maps that one property onto a private raw-host Yoga display channel.
   *
   * Keep the raw-host channel separate from the directive's temporary hidden
   * state. This matters if the private channel changes while `v-show` remains
   * false: the subtree must stay hidden, then reveal using the latest value.
   */
  function installBoxStyle(node: TuiBox): void {
    let authoredDisplay: unknown;
    let directiveHidden = false;
    let effectiveDisplay: "flex" | "none" = "flex";
    let disposed = false;

    const normalizeAuthoredDisplay = (): "flex" | "none" =>
      authoredDisplay != null && authoredDisplay !== "flex" ? "none" : "flex";

    const applyEffectiveDisplay = (): void => {
      const nextDisplay = directiveHidden ? "none" : normalizeAuthoredDisplay();
      if (nextDisplay === effectiveDisplay) return;
      effectiveDisplay = nextDisplay;
      if (disposed) return;
      applyYogaProp(node, "display", nextDisplay);
      onCommit();
    };

    const style = {} as TuiBox["style"];
    Object.defineProperty(style, "display", {
      enumerable: true,
      get: () => {
        if (directiveHidden || normalizeAuthoredDisplay() === "none") return "none";
        return authoredDisplay === "flex" ? "flex" : "";
      },
      set: (value: string) => {
        directiveHidden = value === "none";
        applyEffectiveDisplay();
      },
    });
    Object.defineProperty(node, "style", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: style,
    });

    boxDisplayControllers.set(node, {
      setAuthoredDisplay(value: unknown): void {
        authoredDisplay = value;
        applyEffectiveDisplay();
      },
      dispose(): void {
        disposed = true;
      },
    });
  }

  /**
   * Install Vue's `v-show` display surface on both Text host forms. A top-level
   * Text owns a Yoga node, while a nested Text is composed inline by its nearest
   * top-level Text owner and therefore invalidates that owner's measurement.
   */
  function installTextStyle(node: TuiText | TuiVirtualText): void {
    let directiveHidden = false;
    let disposed = false;

    const style = {} as TuiText["style"];
    Object.defineProperty(style, "display", {
      enumerable: true,
      get: () => (directiveHidden ? "none" : ""),
      set: (value: string) => {
        const nextHidden = value === "none";
        if (directiveHidden === nextHidden) return;
        directiveHidden = nextHidden;
        if (disposed) return;

        if (node.type === "tui-text") {
          applyYogaProp(node, "display", nextHidden ? "none" : "flex");
        } else {
          const owner = findMeasureOwner(node);
          if (owner?.type === "tui-text") markTextContentDirty(owner);
        }
        onCommit();
      },
    });
    Object.defineProperty(node, "style", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: style,
    });

    textDisplayControllers.set(node, {
      dispose(): void {
        disposed = true;
      },
    });
  }

  function createElement(type: string): TuiNode {
    switch (type) {
      case "tui-box": {
        const n = createBox();
        attachHostYoga(n);
        installBoxStyle(n);
        return n;
      }
      case "tui-text": {
        const n = createText();
        attachHostYoga(n);
        bindTextMeasure(n);
        installTextStyle(n);
        return n;
      }
      case "tui-virtual-text": {
        const n = createVirtualText();
        installTextStyle(n);
        return n;
      }
      case "tui-static": {
        const n = createStatic();
        attachHostYoga(n);
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
    // Coerce private raw-host values at the text sink. Guard on typeof so normal
    // string values are stored as-is.
    node.value = typeof text === "string" ? text : String(text);
    // An empty text-leaf can mount as a Vue fragment anchor (insert() exempts empty
    // leaves), then become non-empty content via setText. Re-validate with the SAME
    // rejectsTextLeaf() check insert()/setElementText() use, so non-empty bare text
    // directly under a <Box>/root/<Static> throws HERE (patch/render phase, consistent
    // with "validate at render, not paint") instead of silently vanishing at paint
    // (paintNode only renders a text-leaf via a <Text> parent). A leaf inside a
    // <Text> isn't rejected, a leaf cleared back to "" isn't rejected, and a
    // detached leaf (parent null) is skipped. isContainer narrows parent to the
    // TuiContainer rejectsTextLeaf expects.
    const parent = node.parent;
    if (parent != null && isContainer(parent) && rejectsTextLeaf(parent, node.value)) {
      throw new Error(`Text string "${node.value}" must be rendered inside <Text> component`);
    }
    // Bubble dirty up to the <Text> that owns the Yoga measure function.
    const owner = findMeasureOwner(node.parent as TuiNode | null);
    if (owner?.type === "tui-text") {
      markTextContentDirty(owner);
    }
    onCommit();
  }

  function setElementText(el: TuiNode, text: string): void {
    if (!isContainer(el)) return;
    // Validate the target context BEFORE the destructive remove below: the
    // text-leaf we're about to insert would otherwise hit insert()'s
    // text-context guard and throw AFTER the children are already gone, leaving
    // the node half-cleared (children removed, nothing inserted). Throw the same
    // error up-front instead — shares rejectsTextLeaf() with insert() so the
    // condition + message cannot drift.
    if (rejectsTextLeaf(el, text)) {
      throw new Error(`Text string "${text}" must be rendered inside <Text> component`);
    }
    // Remove existing children first (copy since remove mutates the array).
    for (const child of Array.from(el.children)) remove(child);
    insert(createTextLeaf(text), el, null);
    if (el.type === "tui-text") {
      markTextContentDirty(el);
    }
  }

  function insert(child: TuiNode, parent: TuiNode, anchor: TuiNode | null): void {
    if (!isContainer(parent)) {
      throw new Error(`Cannot insert into ${parent.type}`);
    }
    const parentC = parent as TuiContainer;

    // Static owns one indivisible history block. Validate the complete subtree
    // relation before Yoga insertion so either Vue construction order (parent
    // first or child first) rejects nested history before any renderer commit.
    if (hasNestedStatic(child, isInsideStaticContext(parentC))) {
      throw new Error(NESTED_STATIC_ERROR);
    }

    // A Box inside a text context cannot produce valid inline layout.
    if (child.type === "tui-box" && isInsideTextContext(parentC)) {
      throw new Error("<Box> can’t be nested inside <Text> component");
    }
    if (child.type === "tui-static" && isInsideTextContext(parentC)) {
      throw new Error("<Static> cannot be nested inside <Text> component");
    }

    // Text-leaf nodes must live inside a <Text> context. The rejection condition
    // (incl. the empty-text-leaf fragment-anchor exemption) lives in
    // rejectsTextLeaf() so setElementText()'s pre-remove pre-check stays in sync.
    if (child.type === "text-leaf" && rejectsTextLeaf(parentC, child.value)) {
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
      // Detaching a child from a text context must re-measure the old parent's
      // measure owner. We dirty the old parent here unconditionally; if it
      // shares a measure owner with the new parent, the post-insert dirty below
      // just re-marks the same node (markDirty is idempotent), so no skip is needed.
      dirtyTextMeasureOwner(oldParent);
    }

    const idx = anchor ? parentC.children.indexOf(anchor as never) : parentC.children.length;
    parentC.children.splice(idx < 0 ? parentC.children.length : idx, 0, child as never);
    child.parent = parentC as never;
    insertYogaChild(parentC, child, idx);

    // A text-context parent (text / virtual-text) sizes its inline text via a
    // measure func; a STRUCTURAL change must re-mark the owning measure node
    // dirty so Yoga re-measures.
    dirtyTextMeasureOwner(parentC);

    onCommit();
  }

  function remove(child: TuiNode): void {
    const parent = child.parent;
    if (!parent) return;
    try {
      options.invalidateRenderedSubtree?.(child);
    } catch {
      // Every target adapter already received its cleanup turn. A failing
      // disposer must not prevent Vue from detaching and freeing the host tree.
    }
    const idx = parent.children.indexOf(child as never);
    if (idx >= 0) parent.children.splice(idx, 1);
    removeYogaChild(parent, child);
    // Free yoga nodes for this subtree (descendants first, then this node).
    freeSubtreeYoga(child);
    child.parent = null as never;
    // Re-measure the owning measure node when an inline child is removed from a
    // text context, mirroring the insert() dirty mark. The owner may be an
    // ancestor virtual-text's enclosing <Text>, so resolve it via
    // findMeasureOwner. `parent` still has its own parent chain (only
    // `child.parent` was cleared), so the walk starts from the immediate parent.
    dirtyTextMeasureOwner(parent);
    onCommit();
  }

  /** Recursively retire host display bridges and free each Yoga-carrying descendant. */
  function freeSubtreeYoga(node: TuiNode): void {
    if (isContainer(node)) {
      for (const child of (node as { children: TuiNode[] }).children) {
        freeSubtreeYoga(child);
      }
    }
    if (node.type === "tui-virtual-text") {
      textDisplayControllers.get(node)?.dispose();
    }
    if (node.type === "tui-box" || node.type === "tui-text" || node.type === "tui-static") {
      disposeHostYoga(node);
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
    if (el.type === "tui-static" && key === "internal_onAccepted") {
      // Internal callback used to release the accepted slot subtree while the
      // public <Static> component instance remains mounted as its identity.
      el.onAccepted = typeof next === "function" ? (next as () => void) : undefined;
      onCommit();
      return;
    }
    if (
      el.type === "tui-box" ||
      el.type === "tui-text" ||
      el.type === "tui-static" ||
      el.type === "root"
    ) {
      if (el.type === "tui-box" && key === "display") {
        // Compose the private raw-host channel with `v-show`'s temporary hidden
        // state. Public BoxProps do not expose this key.
        boxDisplayControllers.get(el)?.setAuthoredDisplay(next);
        return;
      }
      if (isYogaProp(key)) {
        applyYogaProp(el, key, next, prev);
        // Some yoga props also need to be stored in el.props for the paint pass.
        if (STYLE_PROPS.has(key)) {
          (el as { props: Record<string, unknown> }).props[key] = next;
        }
        // Border edge widths depend jointly on borderStyle AND each per-edge prop
        // (a yoga setter sees only one value), so any border-prop change triggers a
        // full recompute from el.props. The per-edge Yoga setters
        // are intentional no-ops; this is the single source of truth. Reading
        // el.props (just updated above for STYLE_PROPS) means borderStyle flipping
        // in EITHER direction is handled: unset→set re-reserves, set→unset zeroes,
        // and a per-edge toggle while borderStyle stays unset reserves nothing (so
        // the borderTop/Left/etc defaults of `true` never inset content with no
        // border drawn).
        if (BORDER_PROPS.has(key)) {
          reconcileBorderEdges(el, (el as { props: Record<string, unknown> }).props);
        }
        // Margin/padding edges depend jointly on the specific edge + axis + all-edges
        // shorthands (a yoga setter sees one value, and a more-specific edge overrides
        // a shorthand even at 0), so any family-prop change triggers a full recompute
        // from el.props — same pattern as border. The per-prop yoga setters are no-ops;
        // these reconcilers are the single source of truth. el.props was just updated
        // above (margin/padding keys are in STYLE_PROPS), so a withdrawn override
        // correctly falls back to the surviving shorthand.
        if (MARGIN_PROPS.has(key)) {
          reconcileMarginEdges(el, (el as { props: Record<string, unknown> }).props);
        }
        if (PADDING_PROPS.has(key)) {
          reconcilePaddingEdges(el, (el as { props: Record<string, unknown> }).props);
        }
        if (GUTTER_PROPS.has(key)) {
          reconcileGutters(el, (el as { props: Record<string, unknown> }).props);
        }
      } else if (STYLE_PROPS.has(key)) {
        // Vue patches a key removed from `v-bind` as `null`. For Text's
        // tri-state style channels, removal means "unspecified": colors and
        // modifiers must inherit again, and textAlign / wrap must return to their defaults.
        // Keeping null would make the paint cascade treat the channel as an
        // explicit override and would send wrap through the truncation branch.
        const stored = el.type === "tui-text" && next === null ? undefined : next;
        (el as { props: Record<string, unknown> }).props[key] = stored;
        // `wrap` is the one STYLE_PROP that changes a text node's MEASURED height
        // (the measure func reads el.props.wrap to pick wrap/truncate/hard layout)
        // yet is NOT a yoga prop — so it skips applyYogaProp and never invalidates
        // yoga's cached measurement above. Without re-marking dirty, yoga keeps the
        // OLD wrap mode's height while paint renders with the NEW wrap → layout and
        // paint disagree (stale blank rows on wrap→truncate; overflow / overwritten
        // siblings on truncate→wrap). markTextDirty forces a re-measure. Every other
        // STYLE_PROP here (color/bold/border colors/…) is paint-only and never alters
        // measured dimensions, so `wrap` is the sole case. None of them touches the
        // content revision either: paint reads the current props over the runs the
        // node already holds.
        if (key === "wrap" && el.type === "tui-text") {
          markTextDirty(el);
        }
      } else if (key === "key" || key === "ref" || key.startsWith("on")) {
        // Reserved by Vue / event keys, ignore.
      } else if (!options.isProduction?.()) {
        // eslint-disable-next-line no-console
        console.warn(`[vue-tui] unknown prop "${key}" on <${el.type}>`);
      }
      onCommit();
      return;
    }
    if (el.type === "tui-virtual-text" && STYLE_PROPS.has(key)) {
      // Same removed-key normalization as the top-level Text host above.
      (el.props as Record<string, unknown>)[key] = next === null ? undefined : next;
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
