import stringWidth from "string-width";
import sliceAnsi from "slice-ansi";
import cliBoxes from "cli-boxes";
import {
  type StyledChar,
  styledCharsFromTokens,
  styledCharsToString,
  tokenize,
} from "@alcalzone/ansi-tokenize";
import { applyChalk } from "./text-style.ts";
import { sanitizeAnsi } from "./sanitize-ansi.ts";
import Yoga from "yoga-layout";
import type {
  TuiNode,
  TuiContainer,
  TextProps,
  TuiText,
  TuiVirtualText,
  BoxProps,
} from "../host/nodes.ts";
import { createRoot as createIsoRoot } from "../host/nodes.ts";
import { wrapText, safeSliceEnd } from "../host/text-measure.ts";
import { attachYoga, detachYoga } from "../host/yoga.ts";

export type Transformer = (line: string, lineIndex: number) => string;

interface ClipRect {
  x1: number | undefined;
  x2: number | undefined;
  y1: number | undefined;
  y2: number | undefined;
}

interface WriteOp {
  type: "write";
  x: number;
  y: number;
  lines: string[];
  transformers: Transformer[];
}

interface ClipOp {
  type: "clip";
  clip: ClipRect;
}

interface UnclipOp {
  type: "unclip";
}

type Op = WriteOp | ClipOp | UnclipOp;

class OutputCaches {
  private widths = new Map<string, number>();
  private blockWidths = new Map<string, number>();
  private styledCharsCache = new Map<string, StyledChar[]>();

  getStyledChars(line: string): StyledChar[] {
    let cached = this.styledCharsCache.get(line);
    if (cached === undefined) {
      cached = styledCharsFromTokens(tokenize(line));
      this.styledCharsCache.set(line, cached);
    }
    return cached;
  }

  getStringWidth(text: string): number {
    let cached = this.widths.get(text);
    if (cached === undefined) {
      cached = stringWidth(text);
      this.widths.set(text, cached);
    }
    return cached;
  }

  getWidestLine(text: string): number {
    let cached = this.blockWidths.get(text);
    if (cached === undefined) {
      let lineWidth = 0;
      for (const line of text.split("\n")) {
        lineWidth = Math.max(lineWidth, this.getStringWidth(line));
      }
      cached = lineWidth;
      this.blockWidths.set(text, cached);
    }
    return cached;
  }
}

class Output {
  readonly width: number;
  readonly height: number;
  private ops: Op[] = [];
  private readonly caches: OutputCaches = new OutputCaches();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  write(x: number, y: number, lines: string[], transformers: Transformer[]): void {
    this.ops.push({ type: "write", x, y, lines, transformers });
  }

  clip(rect: ClipRect): void {
    this.ops.push({ type: "clip", clip: rect });
  }

  unclip(): void {
    this.ops.push({ type: "unclip" });
  }

  get(): { output: string; height: number } {
    // Initialize output grid with StyledChar cells
    const output: StyledChar[][] = [];
    for (let y = 0; y < this.height; y++) {
      const row: StyledChar[] = [];
      for (let x = 0; x < this.width; x++) {
        row.push({ type: "char", value: " ", fullWidth: false, styles: [] });
      }
      output.push(row);
    }

    const clips: ClipRect[] = [];

    for (const op of this.ops) {
      if (op.type === "clip") {
        clips.push(op.clip);
        continue;
      }
      if (op.type === "unclip") {
        clips.pop();
        continue;
      }

      // op.type === "write"
      const { transformers } = op;
      let { x, y } = op;
      let lines = op.lines;

      // Only the most recent clip applies (top-only, matching Ink behavior)
      const clip = clips.at(-1);

      if (clip) {
        const clipV = typeof clip.y1 === "number" && typeof clip.y2 === "number";

        // Vertical early skip — safe because transforms don't change line count
        if (clipV) {
          const height = lines.length;
          if (y + height < clip.y1! || y > clip.y2!) continue;
        }

        // Vertical clip
        if (clipV) {
          const from = y < clip.y1! ? clip.y1! - y : 0;
          const height = lines.length;
          const to = y + height > clip.y2! ? clip.y2! - y : height;
          lines = lines.slice(from, to);
          if (y < clip.y1!) y = clip.y1!;
        }
      }

      const clipH =
        clip && typeof clip.x1 === "number" && typeof clip.x2 === "number"
          ? { x1: clip.x1, x2: clip.x2 }
          : null;

      // Safe early skip: entire write starts at or past right clip edge
      if (clipH && x >= clipH.x2) continue;

      let offsetY = 0;

      for (let [index, line] of lines.entries()) {
        const currentLine = output[y + offsetY];

        // Line can be missing if text is taller than pre-initialized output
        if (!currentLine) {
          continue;
        }

        // Apply transforms BEFORE horizontal clipping
        for (const transformer of transformers) {
          line = transformer(line, index);
        }

        // Horizontal clip (per-line, after transform)
        let lineX = x;
        if (clipH) {
          const lineWidth = this.caches.getStringWidth(line);
          // Skip line entirely if outside horizontal clip
          if (lineX + lineWidth < clipH.x1 || lineX > clipH.x2) {
            offsetY++;
            continue;
          }
          const from = lineX < clipH.x1 ? clipH.x1 - lineX : 0;
          const to = lineX + lineWidth > clipH.x2 ? clipH.x2 - lineX : lineWidth;
          if (from > 0) {
            // Advance lineX by however many columns slice-ansi actually drops
            // from the left. slice-ansi@9 is grapheme-aware: a wide grapheme
            // straddling the clip edge is dropped whole, so the retained
            // content starts at `lineX + droppedWidth` (which may exceed
            // `from`). Measuring the kept-prefix width would under-count here
            // and misplace the following text.
            const droppedWidth = lineWidth - this.caches.getStringWidth(sliceAnsi(line, from));
            lineX = lineX + droppedWidth;
          }
          const maxWidth = clipH.x2 - lineX;
          line = safeSliceEnd(sliceAnsi(line, from, to), maxWidth);
        }

        const characters = this.caches.getStyledChars(line);
        let offsetX = lineX;

        // Nothing to write (e.g. line was clipped away)
        if (characters.length === 0) {
          offsetY++;
          continue;
        }

        const spaceCell: StyledChar = {
          type: "char",
          value: " ",
          fullWidth: false,
          styles: [],
        };

        // Wide characters (e.g. CJK) occupy two cells: a leading cell with
        // the character and a trailing placeholder with value ''. When an
        // overlapping write lands in the middle of a wide character, the
        // boundary cells need cleanup so the terminal never renders a
        // half-visible wide character.
        if (
          currentLine[offsetX]?.value === "" &&
          offsetX > 0 &&
          this.caches.getStringWidth(currentLine[offsetX - 1]?.value ?? "") > 1
        ) {
          currentLine[offsetX - 1] = spaceCell;
        }

        for (const character of characters) {
          if (offsetX >= this.width) break;

          const characterWidth = Math.max(1, this.caches.getStringWidth(character.value));

          if (offsetX + characterWidth > this.width) {
            offsetX += characterWidth;
            continue;
          }

          currentLine[offsetX] = character;

          if (characterWidth > 1) {
            for (let i = 1; i < characterWidth; i++) {
              currentLine[offsetX + i] = {
                type: "char",
                value: "",
                fullWidth: false,
                styles: character.styles,
              };
            }
          }

          offsetX += characterWidth;
        }

        if (currentLine[offsetX]?.value === "") {
          currentLine[offsetX] = spaceCell;
        }

        offsetY++;
      }
    }

    const generatedOutput = output
      .map((line) => {
        const lineWithoutEmptyItems = line.filter((item) => item !== undefined);
        return styledCharsToString(lineWithoutEmptyItems).trimEnd();
      })
      .join("\n");

    return { output: generatedOutput, height: output.length };
  }
}

function renderTextWithInlineStyles(node: TuiText | TuiVirtualText, acc: TextProps = {}): string {
  if (!node.children || node.children.length === 0) return "";
  const defined = Object.fromEntries(Object.entries(node.props).filter(([, v]) => v !== undefined));
  const merged: TextProps = { ...acc, ...defined };
  let out = "";
  // `index` is the child's POSITIONAL index among ALL siblings (text-leaves,
  // virtual-text, transforms, comments alike) — it is the plain loop counter,
  // matching Ink squash-text-nodes.ts:13,38 where `internal_transform(text,
  // index)` receives the loop index over `node.childNodes`. A nested <Transform>
  // that is the Nth child therefore gets `index = N`, not a hardcoded 0.
  node.children.forEach((child, index) => {
    out += squashTransformChild(child, index, merged);
    // Skip comments inserted by Vue for null/undefined renders
  });
  return sanitizeAnsi(out);
}

// Squash a single inline child into styled text, recursing GENERICALLY into
// transform-typed children to ANY nesting depth. This mirrors Ink's
// squash-text-nodes.ts:22-39, where the loop recurses into every ink-text /
// ink-virtual-text child (a <Transform> renders an ink-text carrying
// internal_transform) and then applies that child's transform. Because a
// <Transform> nested directly inside another <Transform> is itself such a child,
// it MUST be recursed into — otherwise the inner content is silently dropped
// (G32). `index` is the child's positional sibling index (G21), and the transform
// is only applied when there is actual text (Ink squash-text-nodes.ts:34).
function squashTransformChild(child: TuiNode, index: number, merged: TextProps): string {
  if (child.type === "text-leaf") {
    return applyChalk(child.value, merged);
  }
  if (child.type === "virtual-text" || child.type === "text") {
    return renderTextWithInlineStyles(child, merged);
  }
  if (child.type === "transform") {
    let innerText = "";
    child.children.forEach((grandchild, grandIndex) => {
      // A grandchild may itself be a <Transform> (or text/virtual-text/text) —
      // recurse with the SAME logic so nesting works to any depth.
      innerText += squashTransformChild(grandchild, grandIndex, merged);
    });
    if (innerText.length > 0 && child.transform) {
      innerText = child.transform(innerText, index);
    }
    return innerText;
  }
  // Comments (null/undefined renders), boxes, etc. contribute nothing.
  return "";
}

type BoxStyle = (typeof cliBoxes)[keyof cliBoxes.Boxes];

function drawBorder(
  output: Output,
  x: number,
  y: number,
  w: number,
  h: number,
  props: BoxProps,
  transformers: Transformer[],
): void {
  const style = props["borderStyle"] as string | BoxStyle | undefined;
  if (!style) return;
  // Ink parity (render-border.ts:31-34): if borderStyle is already a BoxStyle object,
  // use it directly; otherwise look it up by name in cliBoxes.
  const chars: BoxStyle | undefined =
    typeof style === "string"
      ? (cliBoxes as unknown as Record<string, BoxStyle | undefined>)[style]
      : style;
  if (!chars) return;
  // No blanket min-size guard here — each edge is drawn independently when it is
  // visible and its run length is ≥ 1. This matches Ink's render-border.ts which
  // has no such guard and draws every edge on its own, so a 1-cell-tall box with
  // only side rails still renders │X│ (G05), and a 1-cell-wide box with only
  // top/bottom still renders the top/bottom glyph. Guard individual repeat()
  // counts with Math.max(0, …) so a degenerate dimension doesn't throw.
  if (w < 1 || h < 1) return;

  const top = props["borderTop"] !== false;
  const bottom = props["borderBottom"] !== false;
  const left = props["borderLeft"] !== false;
  const right = props["borderRight"] !== false;

  const borderColor = props["borderColor"] as string | undefined;
  // Keep the raw (non-coerced) general dim value so per-edge overrides work correctly.
  const generalDim = props["borderDimColor"] as boolean | undefined;

  function colorizeEdge(s: string, edge: "top" | "bottom" | "left" | "right"): string {
    const capEdge = edge.charAt(0).toUpperCase() + edge.slice(1);
    const edgeColor = (props[`border${capEdge}Color`] as string | undefined) ?? borderColor;
    // Use nullish coalescing (not ||) so an explicit per-edge `false` wins over
    // generalDim — only `undefined` falls back to the general value.
    // Mirrors Ink render-border.ts:54: `borderTopDimColor ?? borderDimColor`.
    const edgeDim = (props[`border${capEdge}DimColor`] as boolean | undefined) ?? generalDim;
    // Ink parity (render-border.ts:44-52): an edge's background comes only from the
    // per-edge or general border background — never from the Box's own backgroundColor.
    const edgeBg =
      (props[`border${capEdge}BackgroundColor`] as string | undefined) ??
      (props["borderBackgroundColor"] as string | undefined);
    const p: TextProps = {};
    if (edgeColor) p.color = edgeColor;
    if (edgeBg) p.backgroundColor = edgeBg;
    if (edgeDim) p.dimColor = true;
    return Object.keys(p).length > 0 ? applyChalk(s, p) : s;
  }

  if (top) {
    const tl = left ? chars.topLeft : chars.top;
    const tr = right ? chars.topRight : chars.top;
    const fill = Math.max(0, w - stringWidth(tl) - stringWidth(tr));
    const raw = tl + chars.top.repeat(fill) + tr;
    output.write(x, y, [colorizeEdge(safeSliceEnd(raw, w), "top")], transformers);
  }
  if (bottom) {
    const bl = left ? chars.bottomLeft : chars.bottom;
    const br = right ? chars.bottomRight : chars.bottom;
    const fill = Math.max(0, w - stringWidth(bl) - stringWidth(br));
    const raw = bl + chars.bottom.repeat(fill) + br;
    output.write(x, y + h - 1, [colorizeEdge(safeSliceEnd(raw, w), "bottom")], transformers);
  }

  // Ink parity (render-border.ts:133): vertical sides start at y + offsetY where
  // offsetY = showTopBorder ? 1 : 0. Without this, the loop starting at i=1
  // always skips row 0, shifting rails one row down when borderTop=false (G15).
  // The run length equals h minus the visible top/bottom rows, clamped ≥ 0.
  const offsetY = top ? 1 : 0;
  const verticalRun = Math.max(0, h - (top ? 1 : 0) - (bottom ? 1 : 0));
  for (let i = 0; i < verticalRun; i++) {
    if (left) output.write(x, y + offsetY + i, [colorizeEdge(chars.left, "left")], transformers);
    if (right)
      output.write(x + w - 1, y + offsetY + i, [colorizeEdge(chars.right, "right")], transformers);
  }
}

function fillBackground(
  output: Output,
  x: number,
  y: number,
  w: number,
  h: number,
  color: unknown,
  transformers: Transformer[],
): void {
  if (!color) return;
  const line = applyChalk(" ".repeat(w), { backgroundColor: color });
  for (let i = 0; i < h; i++) output.write(x, y + i, [line], transformers);
}

export function paint(root: TuiNode): string {
  if (root.type !== "root") throw new Error("paint expects TuiRoot");
  const layout = root.yoga.getComputedLayout();
  const width = Math.max(1, Math.floor(layout.width));
  const height = Math.max(1, Math.floor(layout.height));
  const out = new Output(width, height);
  paintNode(root, out, 0, 0, []);
  return out.get().output;
}

function paintNode(
  node: TuiNode,
  output: Output,
  x0: number,
  y0: number,
  transformers: Transformer[],
  inheritedBg?: string,
): void {
  // display:none — yoga collapses the node to zero size but still reports a
  // layout; skip painting the subtree entirely (matches Ink's renderNodeToOutput
  // early-return) so hidden content never leaks onto visible siblings.
  const yogaNode = (node as { yoga?: { getDisplay?: () => number } }).yoga;
  if (yogaNode?.getDisplay?.() === Yoga.DISPLAY_NONE) return;

  switch (node.type) {
    case "root": {
      for (const child of node.children) paintNode(child, output, x0, y0, transformers);
      return;
    }
    case "box": {
      const layout = node.yoga.getComputedLayout();
      const x = x0 + layout.left;
      const y = y0 + layout.top;
      const w = Math.max(0, Math.floor(layout.width));
      const h = Math.max(0, Math.floor(layout.height));
      const bg = (node.props["backgroundColor"] as string | undefined) ?? inheritedBg;
      if (node.props["borderStyle"]) {
        drawBorder(output, x, y, w, h, node.props, transformers);
      }
      if (bg) {
        const hasBorder = !!node.props["borderStyle"];
        const bt = hasBorder && node.props["borderTop"] !== false ? 1 : 0;
        const bb = hasBorder && node.props["borderBottom"] !== false ? 1 : 0;
        const bl = hasBorder && node.props["borderLeft"] !== false ? 1 : 0;
        const br = hasBorder && node.props["borderRight"] !== false ? 1 : 0;
        fillBackground(output, x + bl, y + bt, w - bl - br, h - bt - bb, bg, transformers);
      }

      // Overflow clipping: clip children to the box content area (inside
      // borders) when overflow/overflowX/overflowY is "hidden". Matches Ink's
      // per-axis clip/unclip approach.
      let clipped = false;
      const overflow = node.props["overflow"] as string | undefined;
      const clipH =
        overflow === "hidden" || (node.props["overflowX"] as string | undefined) === "hidden";
      const clipV =
        overflow === "hidden" || (node.props["overflowY"] as string | undefined) === "hidden";
      if (clipH || clipV) {
        const bl = node.yoga.getComputedBorder(Yoga.EDGE_LEFT);
        const br = node.yoga.getComputedBorder(Yoga.EDGE_RIGHT);
        const bt = node.yoga.getComputedBorder(Yoga.EDGE_TOP);
        const bb = node.yoga.getComputedBorder(Yoga.EDGE_BOTTOM);
        output.clip({
          x1: clipH ? x + bl : undefined,
          x2: clipH ? x + w - br : undefined,
          y1: clipV ? y + bt : undefined,
          y2: clipV ? y + h - bb : undefined,
        });
        clipped = true;
      }

      for (const child of node.children) paintNode(child, output, x, y, transformers, bg);

      if (clipped) output.unclip();
      return;
    }
    case "text": {
      const layout = node.yoga.getComputedLayout();
      const bgProps: TextProps = inheritedBg ? { backgroundColor: inheritedBg } : {};
      const text = renderTextWithInlineStyles(node, bgProps);
      // Skip writing empty text — avoids applying line transformers to empty
      // content, which matches Ink's behavior of not writing empty text nodes.
      if (text === "") return;
      const cellWidth = Math.max(1, Math.floor(layout.width));
      const wrapped = wrapText(text, cellWidth, node.props.wrap ?? "wrap");
      if (inheritedBg) {
        for (let i = 0; i < wrapped.length; i++) {
          const pad = cellWidth - stringWidth(wrapped[i]!);
          const padStr = pad > 0 ? " ".repeat(pad) : "";
          wrapped[i] = applyChalk(wrapped[i]! + padStr, bgProps);
        }
      }
      output.write(x0 + layout.left, y0 + layout.top, wrapped, transformers);
      return;
    }
    case "static": {
      // Static is rendered through the static channel (written before frame), so
      // it does not contribute to the dynamic frame paint.
      return;
    }
    case "transform": {
      const layout = node.yoga.getComputedLayout();
      const x = x0 + layout.left;
      const y = y0 + layout.top;
      const next = [node.transform, ...transformers];
      for (const child of node.children) paintNode(child, output, x, y, next, inheritedBg);
      return;
    }
    case "virtual-text":
    case "text-leaf":
    case "comment":
      // virtual-text and text-leaf are handled inside renderTextWithInlineStyles.
      // Comments are invisible.
      return;
  }
}

export function paintContainer(container: TuiContainer): string {
  // Used by Static channel and tests.
  if (container.type === "root") return paint(container);
  throw new Error("paintContainer currently only supports root");
}

export function paintIsolated(
  nodes: TuiNode[],
  width: number,
  staticNode?: import("../host/nodes.ts").TuiStatic,
): string {
  const iso = createIsoRoot({} as never);
  attachYoga(iso);

  // Mirror the static node's RESOLVED layout onto the iso root. (G44)
  //
  // Ink lays the static node out via its OWN yoga node: Static.tsx merges
  // `{position:'absolute', flexDirection:'column', ...customStyle}` onto the
  // internal_static <ink-box>, and renderer.ts:48-56 reads
  // node.staticNode.yogaNode's computed size/layout directly. So every layout
  // style prop on `<Static style={{...}}>` (flexDirection, padding, margin,
  // gap, justifyContent, alignItems, width, ...) must drive the static paint.
  //
  // Previously this iterated `staticNode.props` and re-applied only the props
  // found there — but node-ops only stores VISUAL props (color/border/overflow)
  // in `el.props`; LAYOUT props are applied straight to yoga and never land in
  // `props`. So flexDirection/padding/etc. were silently dropped and the iso
  // root hard-defaulted to FLEX_DIRECTION_COLUMN. Instead we `copyStyle` the
  // static node's yoga — which already holds every resolved layout prop
  // (including the <Static> column default) via node-ops applyYogaProp — onto
  // the fresh iso root. This is the read-back equivalent of Ink reusing
  // node.staticNode.yogaNode, without reparenting the live static node's own
  // yoga children (the main-tree layout/measure stays untouched).
  if (staticNode) {
    iso.yoga.copyStyle(staticNode.yoga);
    // attachYoga() sets the static node's OWN yoga to display:none so it occupies
    // no space in the dynamic frame's main-tree layout (yoga.ts:61-63). copyStyle
    // drags that display:none onto the iso root — which would make paint() short-
    // circuit and emit nothing. The iso root is the standalone paint root and must
    // be visible, so force it back to display:flex.
    iso.yoga.setDisplay(Yoga.DISPLAY_FLEX);
    // The <Static> default style is `position:'absolute'` (Static.tsx) — correct
    // when the static node is a child of the main tree (Ink lays it out there),
    // but here the static node IS the standalone layout root. An absolute root
    // with auto size collapses to 0x0 and paints nothing, so force it back to
    // the default relative positioning. (We only ever read the children's
    // computed positions; the root's own position type is irrelevant otherwise.)
    iso.yoga.setPositionType(Yoga.POSITION_TYPE_RELATIVE);
    // The iso root is a standalone layout root constrained to the available
    // columns. Only force the column width when the static node had no explicit
    // width of its own; an explicit `<Static style={{width}}>` is copied above
    // and must win (it governs how children lay out and wrap).
    const w = staticNode.yoga.getWidth();
    if (w.unit !== Yoga.UNIT_POINT && w.unit !== Yoga.UNIT_PERCENT) {
      iso.yoga.setWidth(width);
    }
  } else {
    iso.yoga.setWidth(width);
  }

  // Track which nodes we successfully added to iso's yoga tree so we can
  // remove them afterwards. Nodes that are already parented in another yoga
  // tree are first removed from that parent before insertion.
  //
  // IMPORTANT: We deliberately do NOT mutate each node's DOM .parent field.
  // The children remain logically owned by their original Static parent — only
  // yoga parentage is temporarily transferred to iso for layout calculation.
  // Mutating .parent would leave the original tree with broken back-links and
  // cause renderer.remove() to skip yoga cleanup (seeing parent === null).
  type YogaCarrier = { yoga: import("yoga-layout").Node };
  const yogaAdded: Array<{
    yc: YogaCarrier;
    origParent: import("yoga-layout").Node | null;
    origIndex: number;
  }> = [];

  // yIdx tracks only yoga-carrying nodes; DOM-only nodes (text-leaf, comment,
  // fragment anchors) do not contribute a yoga slot and must not advance it.
  let yIdx = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    // Add to iso.children for paint() traversal, but do NOT change node.parent.
    iso.children.push(node);

    const yCarrier = node as unknown as YogaCarrier;
    // Skip nodes that carry no yoga node (text-leaf, comment, fragment anchors).
    if (!yCarrier.yoga || typeof yCarrier.yoga === "symbol") continue;

    // If the node already has a yoga parent, temporarily remove it so we can
    // re-insert it under iso for layout calculation.
    const yParent = (yCarrier.yoga as unknown as { getParent(): import("yoga-layout").Node | null })
      .getParent
      ? (yCarrier.yoga as unknown as { getParent(): import("yoga-layout").Node | null }).getParent()
      : null;
    const origIndex = yParent ? findYogaIndex(yParent, yCarrier.yoga) : 0;
    if (yParent) {
      yParent.removeChild(yCarrier.yoga);
    }
    iso.yoga.insertChild(yCarrier.yoga, yIdx);
    yogaAdded.push({ yc: yCarrier, origParent: yParent, origIndex });
    yIdx++;
  }

  try {
    iso.yoga.calculateLayout(width, undefined, Yoga.DIRECTION_LTR);
    return paint(iso);
  } finally {
    // Restore yoga parents in reverse order so earlier indices remain stable.
    for (const { yc, origParent, origIndex } of yogaAdded.slice().reverse()) {
      iso.yoga.removeChild(yc.yoga);
      if (origParent) {
        origParent.insertChild(yc.yoga, origIndex);
      }
    }

    // Remove children from iso without touching their .parent pointers — they
    // still belong to the original Static node in the live DOM tree.
    iso.children.length = 0;
    detachYoga(iso);
  }
}

function findYogaIndex(
  parent: import("yoga-layout").Node,
  child: import("yoga-layout").Node,
): number {
  for (let i = 0; i < parent.getChildCount(); i++) {
    if (parent.getChild(i) === child) return i;
  }
  return 0;
}
