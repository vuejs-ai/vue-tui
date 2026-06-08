import stringWidth from "string-width";
import sliceAnsi from "slice-ansi";
import cliBoxes from "cli-boxes";
import {
  type StyledChar,
  styledCharsFromTokens,
  styledCharsToString,
  tokenize,
} from "@alcalzone/ansi-tokenize";
import chalk from "chalk";
import { applyChalk, applyColor } from "./text-style.ts";
import { sanitizeAnsi } from "./sanitize-ansi.ts";
import Yoga from "yoga-layout";
import type {
  TuiNode,
  TuiContainer,
  TextProps,
  TuiText,
  TuiVirtualText,
  TuiTransform,
  BoxProps,
  TuiBox,
} from "../host/nodes.ts";
import { transformHasYogaChild } from "../host/yoga.ts";
import { createRoot as createIsoRoot, createBox as createIsoBox } from "../host/nodes.ts";
import { calculateLayoutWithContentGuards } from "../host/layout-guards.ts";
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

      // Safe early skip: entire write starts strictly PAST the right clip edge.
      // Must be strict `>` (not `>=`), matching Ink output.ts:188 (`x > clip.x2`):
      // an op that starts AT x === clip.x2 still has to take the per-line clip path
      // so its transformers run on the (empty) clipped slice. A transformer that
      // produces output from empty input (e.g. `() => '中'`) emits AT the clip edge;
      // a whole-op `>=` skip would wrongly drop it. The inner per-line clip below
      // already uses strict `>`, so for normal/identity ops x === clip.x2 still
      // clips to empty → characters.length === 0 → skip (no net output).
      if (clipH && x > clipH.x2) continue;

      let offsetY = 0;

      for (let [index, line] of lines.entries()) {
        const currentLine = output[y + offsetY];

        // Line can be missing if text is taller than pre-initialized output
        if (!currentLine) {
          continue;
        }

        // Horizontal clip BEFORE applying transforms, matching Ink's
        // output.ts: the `clipHorizontally` sliceAnsi map runs first, THEN the
        // `lines.entries()` loop calls `transformer(line, index)` on the
        // already-clipped span. Width-sensitive transforms (gradients spread
        // across the visible columns, OSC-8 hyperlinks whose closing sequence
        // must not be sliced off) depend on receiving exactly the clipped
        // substring — applying them to the full line and slicing the result
        // corrupts the gradient stops and can truncate the link terminator.
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
          // After a LEFT clip the write origin is the clipped left edge — matching
          // Ink output.ts:210-212 `if (x < clip.x1) x = clip.x1`. slice-ansi@9 is
          // grapheme-aware, so a wide glyph straddling the clip edge is dropped
          // whole and the kept content begins at this origin with NO leading
          // offset. (We deliberately do NOT advance the origin by the dropped
          // glyph's extra column — that produced a vue-tui-specific leading space
          // that Ink never emits.)
          if (lineX < clipH.x1) lineX = clipH.x1;
          const maxWidth = clipH.x2 - lineX;
          line = safeSliceEnd(sliceAnsi(line, from, to), maxWidth);
        }

        // Apply transforms to the (now horizontally clipped) line. `index` is the
        // post-vertical-clip line index — unchanged from the loop counter, matching
        // Ink's `transformer(line, index)` where index is the entry index.
        for (const transformer of transformers) {
          line = transformer(line, index);
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

        // NO x-bounds check here — matches Ink's Output write loop
        // (output.ts:272-294), which writes `currentLine[offsetX] = character`
        // and the trailing placeholder cells regardless of `this.width`. A wide
        // char whose LEADING cell is in-bounds but whose TRAILING cell exceeds
        // the width still renders its leading cell and OVERFLOWS the row; the
        // past-width placeholder is dropped later as a sparse hole by
        // `line.filter(item => item !== undefined)` + `.trimEnd()` (see below).
        // Guarding on width here (as vue once did) instead DROPPED the whole wide
        // char — leading cell included — when only its trailing cell was past the
        // edge, so an edge-aligned `aa你` rendered as `aa`. Box-level
        // overflow:hidden clipping is handled separately above (the clipH sliceAnsi
        // path); this loop must not re-implement a second, glyph-truncating clip.
        for (const character of characters) {
          const characterWidth = Math.max(1, this.caches.getStringWidth(character.value));

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

// Compose a <Text>/<virtual-text> node's styled string by WRAPPING, matching
// Ink's squash-text-nodes.ts + render-node-to-output.ts:136 model EXACTLY (and
// REPLACING the old merge-down + per-leaf-applyChalk model, which closed the
// parent's SGR at every nested-<Text> boundary so ancestor boolean styles —
// bold/italic/underline/strikethrough/dim — did NOT survive across a nested
// child; that was the bug).
//
// Ink: each <Text> renders an `ink-text` carrying its own chalk styling as
// `internal_transform`. `squashTextNodes` concatenates a node's children — and
// for each nested ink-text child it applies THAT CHILD's transform to the child's
// own squashed text — but it does NOT apply the node's OWN transform. The node's
// own transform is applied one level up: either by ITS parent's squash loop (when
// the node is itself a nested child) or by the Output writer for the top-level
// node (render-node-to-output.ts:136 pushes internal_transform as a per-line
// transformer). The upshot: a Text's own style wraps the CONCATENATION of its
// already-styled children, so `<Text bold>A<Text green>B</Text></Text>` becomes
// `chalk.bold("A" + chalk.green("B"))` — bold stays OPEN across the green child.
//
// Background inheritance is faithful to Ink, where only <Box> provides
// `backgroundContext` (Text does NOT): `inheritedBg` is the nearest enclosing
// Box's bg and is threaded UNCHANGED to every descendant <Text> (a parent Text's
// own backgroundColor never alters it). Each Text's string own bg wins (Ink's
// `ownBackgroundColor ?? inheritedBg` for the public string-only surface), while
// host-level non-string values are treated as absent. An explicit
// `backgroundColor=""` remains a string own bg, resolves to a falsy value, and
// opts the span out.
function renderTextWithInlineStyles(node: TuiText | TuiVirtualText, inheritedBg?: unknown): string {
  if (!node.children || node.children.length === 0) return "";
  // Concatenate children, each already carrying its OWN style (a nested <Text>
  // child wraps itself; the Box bg threads through unchanged), then wrap the whole
  // concatenation with THIS node's own style — Ink's parent-wraps-children model.
  const inner = squashInlineChildren(node.children, inheritedBg);
  return sanitizeAnsi(applyOwnStyle(node.props, inner, inheritedBg));
}

// Apply a Text node's OWN chalk styling as a wrap around its already-composed
// children string — the vue-tui equivalent of Ink's `internal_transform` being
// applied to the node's squashed children. The node's effective bg is
// `ownBackgroundColor ?? inheritedBg` (`??`, so an explicit "" opts out) — exactly
// Ink Text.tsx:103-106. We build the prop set the wrap uses from the node's OWN
// defined props plus this effective bg, NOT the inherited boolean styles: those
// already wrap us at the ancestor level, so re-applying them here would double
// the SGR codes.
function applyOwnStyle(props: TextProps, inner: string, inheritedBg: unknown): string {
  if (inner.length === 0) return inner;
  const defined = Object.fromEntries(
    Object.entries(props).filter(([, v]) => v !== undefined),
  ) as TextProps;
  // effective bg: string own backgroundColor wins (incl. an explicit "" opt-out);
  // non-string host values are not part of the public color surface and must not
  // cut off Box background inheritance.
  const ownBg = defined.backgroundColor;
  const effectiveBg = typeof ownBg === "string" ? ownBg : inheritedBg;
  const styleProps: TextProps = { ...defined, backgroundColor: effectiveBg };
  return applyChalk(inner, styleProps);
}

// Squash an array of inline children into styled text. Shared by text /
// virtual-text nodes AND by a standalone <Transform> rendered as an inline text
// node (G58) — in Ink a <Transform> IS an ink-text host, so its bare-string /
// <Newline> / nested <Text> children squash exactly like any ink-text's
// children (squash-text-nodes.ts).
//
// `transformIndex` is the child's POSITIONAL index among the siblings React
// would have produced as DOM childNodes — matching Ink squash-text-nodes.ts:13
// where `internal_transform(text, index)` receives the loop index over
// `node.childNodes`. In React a `null`/`undefined`/`false` child produces NO
// childNode, so it never advances `index`; Vue, by contrast, materializes those
// renders as COMMENT host nodes that DO occupy a positional slot in
// `node.children`. We therefore advance `transformIndex` only for real children
// (skipping comments), so a nested <Transform> preceded by a `{null}` sibling
// still gets index 1 (not 2) — Ink parity (G52). A real <Transform> among real
// siblings still gets its correct positional index (G21).
//
// `inheritedBg` is the nearest enclosing Box bg (NOT a merged style set): it
// threads UNCHANGED to descendant <Text> nodes, which each wrap themselves with
// their own style (Ink's parent-wraps-children composition).
function squashInlineChildren(children: readonly TuiNode[], inheritedBg: unknown): string {
  let out = "";
  let transformIndex = 0;
  for (const child of children) {
    out += squashTransformChild(child, transformIndex, inheritedBg);
    // Comments (Vue's null/v-if/false renders) contribute "" and, like React's
    // absent childNodes, must NOT advance the transform index.
    if (child.type !== "comment") transformIndex++;
  }
  return out;
}

// Render a standalone <Transform> (one NOT rendered inline inside a <Text>, and
// with no yoga-carrying children) as if it were an inline text node — its
// direct text-leaf / virtual-text / <Newline> children are squashed into a
// string. The transform's OWN fn is intentionally NOT applied here: it is pushed
// as a line-transformer onto the Output write (paintNode "transform" case), so
// it applies per LINE at paint time, matching Ink where internal_transform runs
// in the Output, never in squashTextNodes for the node it lives on. (G58)
function renderTransformAsText(node: TuiTransform, inheritedBg?: unknown): string {
  if (!node.children || node.children.length === 0) return "";
  return sanitizeAnsi(squashInlineChildren(node.children, inheritedBg));
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
//
// A bare text-leaf has NO style of its own (it is React's `#text` node, which
// carries no `internal_transform`), so it contributes its RAW value — NOT even
// the inherited Box bg. ALL styling, including the effective bg
// (`ownBg ?? inheritedBg`), is applied exactly ONCE by the enclosing <Text>'s
// applyOwnStyle, around the whole children concatenation. Applying the inherited
// bg here too would emit a SECOND, INNER bg-open that wins over the outer one for
// these glyphs — e.g. `<Box bg=red><Text bg=blue>x` would render red, not blue.
// A nested <Text>/<virtual-text> child wraps itself (renderTextWithInlineStyles),
// carrying its own style INSIDE the parent's eventual wrap.
function squashTransformChild(child: TuiNode, index: number, inheritedBg: unknown): string {
  if (child.type === "text-leaf") {
    return child.value;
  }
  if (child.type === "virtual-text" || child.type === "text") {
    return renderTextWithInlineStyles(child, inheritedBg);
  }
  if (child.type === "transform") {
    let innerText = "";
    // Recursive twin of the G52 fix in renderTextWithInlineStyles: a grandchild's
    // positional index must skip Vue comment nodes (null/v-if/false renders),
    // which React would not have produced as childNodes, so a `{null}` inside this
    // OUTER <Transform> does not shift an INNER <Transform>'s index. Advancing the
    // counter only for real children preserves G32's transform-in-transform
    // recursion (each grandchild may itself be a <Transform> recursed to any depth)
    // while keeping the index basis identical to the top-level loop.
    let grandIndex = 0;
    for (const grandchild of child.children) {
      innerText += squashTransformChild(grandchild, grandIndex, inheritedBg);
      if (grandchild.type !== "comment") grandIndex++;
    }
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
  // Defensive internal fallback: an unknown borderStyle name has no entry in
  // cliBoxes, so silently draw no border rather than throw. This is unreachable
  // via the public API — the Box component validates an unknown non-empty
  // borderStyle string during render and throws there (caught by vue-tui's error
  // boundary), so paint never sees an invalid name. A raw throw HERE would unwind
  // through Vue's post-flush commit and wedge its internal flush state. (audit 2.3)
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

  const stringProp = (name: string): string | undefined => {
    const value = props[name];
    return typeof value === "string" ? value : undefined;
  };

  const borderColor = stringProp("borderColor");
  // Keep the raw (non-coerced) general dim value so per-edge overrides work correctly.
  const generalDim = props["borderDimColor"] as boolean | undefined;
  const borderBackgroundColor = stringProp("borderBackgroundColor");

  function colorizeEdge(s: string, edge: "top" | "bottom" | "left" | "right"): string {
    const capEdge = edge.charAt(0).toUpperCase() + edge.slice(1);
    const edgeColor = stringProp(`border${capEdge}Color`) ?? borderColor;
    // Use nullish coalescing (not ||) so an explicit per-edge `false` wins over
    // generalDim — only `undefined` falls back to the general value.
    // Mirrors Ink render-border.ts:54: `borderTopDimColor ?? borderDimColor`.
    const edgeDim = (props[`border${capEdge}DimColor`] as boolean | undefined) ?? generalDim;
    // Ink parity (render-border.ts:44-52): an edge's background comes only from the
    // per-edge or general border background — never from the Box's own backgroundColor.
    const edgeBg = stringProp(`border${capEdge}BackgroundColor`) ?? borderBackgroundColor;
    // Border SGR nesting deliberately differs from <Text>'s. Mirror Ink's
    // render-border.ts stylePiece (commit 40b3a75, lines 7-20) EXACTLY:
    // foreground innermost, then background, then `chalk.dim` OUTERMOST —
    // i.e. chalk.dim(bg(fg(glyphs))). This is NOT applyChalk's order, whose
    // dim-innermost nesting is correct for <Text> (Ink Text.tsx) and must
    // stay unchanged. Routing edges through applyChalk would emit the bytes
    // in the wrong order (bg, fg, dim) versus Ink's (dim, bg, fg).
    let styled = s;
    if (edgeColor) styled = applyColor(chalk, edgeColor, false)(styled);
    if (edgeBg) styled = applyColor(chalk, edgeBg, true)(styled);
    if (edgeDim) styled = chalk.dim(styled);
    return styled;
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

function getBoxContentMetrics(
  node: TuiBox,
  w: number,
  h: number,
): { width: number; height: number } {
  const left =
    node.yoga.getComputedBorder(Yoga.EDGE_LEFT) + node.yoga.getComputedPadding(Yoga.EDGE_LEFT);
  const right =
    node.yoga.getComputedBorder(Yoga.EDGE_RIGHT) + node.yoga.getComputedPadding(Yoga.EDGE_RIGHT);
  const top =
    node.yoga.getComputedBorder(Yoga.EDGE_TOP) + node.yoga.getComputedPadding(Yoga.EDGE_TOP);
  const bottom =
    node.yoga.getComputedBorder(Yoga.EDGE_BOTTOM) + node.yoga.getComputedPadding(Yoga.EDGE_BOTTOM);
  const frameWidth = left + right;
  const frameHeight = top + bottom;

  return {
    width: Math.max(0, Math.floor(w - frameWidth)),
    height: Math.max(0, Math.floor(h - frameHeight)),
  };
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
  const width = Math.max(0, Math.floor(w));
  const height = Math.max(0, Math.floor(h));
  if (width === 0 || height === 0) return;

  const line = applyChalk(" ".repeat(width), { backgroundColor: color });
  for (let i = 0; i < height; i++) output.write(x, y + i, [line], transformers);
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
      // Split the Box's own bg from the value threaded to children — they use
      // different fallback rules, mirroring Ink's two separate guards:
      //   - FILL uses the Box's OWN bg with a FALSY guard (Ink render-background.ts:11
      //     `if (!node.style.backgroundColor) return`), so an empty-string own-bg
      //     (`backgroundColor=""`) paints NO fill. `fillBackground` itself also guards
      //     `if (!color)`, but keep the own value here so a sized/bordered empty-bg Box
      //     never fills its content area with an ancestor color Ink wouldn't emit.
      //   - The value THREADED to children uses a TRUTHY fallback to `inheritedBg`
      //     (Ink Box.tsx:103 `if (backgroundColor)` provide-guard), so an empty-string
      //     own-bg does NOT override the ancestor's background context — descendants
      //     keep inheriting it.
      const rawBg = node.props["backgroundColor"];
      const ownBg = typeof rawBg === "string" ? rawBg : undefined;
      const childBg = ownBg ? ownBg : inheritedBg;
      if (node.props["borderStyle"]) {
        drawBorder(output, x, y, w, h, node.props, transformers);
      }
      if (ownBg) {
        const hasBorder = !!node.props["borderStyle"];
        const bt = hasBorder && node.props["borderTop"] !== false ? 1 : 0;
        const bb = hasBorder && node.props["borderBottom"] !== false ? 1 : 0;
        const bl = hasBorder && node.props["borderLeft"] !== false ? 1 : 0;
        const br = hasBorder && node.props["borderRight"] !== false ? 1 : 0;
        fillBackground(output, x + bl, y + bt, w - bl - br, h - bt - bb, ownBg, transformers);
      }

      // Overflow clipping: clip children to the box content area (inside
      // borders) when overflow/overflowX/overflowY is "hidden". Matches Ink's
      // per-axis clip/unclip approach. Applied BEFORE the zero-content decision
      // so a degenerate box's absolute children are still clipped by overflow.
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

      const contentMetrics = getBoxContentMetrics(node, w, h);
      // A Box with no inner content area has no legal paint region for FLOW
      // children. Absolutely-positioned children, though, are placed against
      // the containing block (border-box), not the content rect — Ink still
      // paints them — so paint just those and keep flow children suppressed.
      if (contentMetrics.width === 0 || contentMetrics.height === 0) {
        for (const child of node.children) {
          const childYoga = (child as { yoga?: { getPositionType?: () => number } }).yoga;
          if (childYoga?.getPositionType?.() === Yoga.POSITION_TYPE_ABSOLUTE) {
            paintNode(child, output, x, y, transformers, childBg);
          }
        }
        if (clipped) output.unclip();
        return;
      }

      for (const child of node.children) paintNode(child, output, x, y, transformers, childBg);

      if (clipped) output.unclip();
      return;
    }
    case "text": {
      const layout = node.yoga.getComputedLayout();
      // Thread the INHERITED Box bg (NOT a pre-computed effective bg) into the
      // squash. The Text's own backgroundColor — including an explicit "" opt-out —
      // is resolved against this inherited bg inside applyOwnStyle
      // (`ownBackgroundColor ?? inheritedBg`, Ink Text.tsx:103-106), where it wraps
      // the node's whole children concatenation alongside its boolean styles.
      const text = renderTextWithInlineStyles(node, inheritedBg);
      // Skip writing empty text — avoids applying line transformers to empty
      // content, which matches Ink's behavior of not writing empty text nodes.
      if (text === "") return;
      // Wrap at the TRUE cell width (unclamped), matching Ink's paint, which wraps at
      // getMaxWidth(yogaNode) — a value that can legitimately be 0 (flexBasis=0, width=0,
      // width="0%"). At width 0, wrapText returns the leading-newline wrap "\nA" → ["", "A"],
      // pushing the glyph onto its own SECOND row exactly as the measure func reported
      // (height 2). Clamping this to 1 would re-collapse to ["A"] on the first row, where a
      // row-sibling overwrites it (the text-drop bug). Fitting text is untouched: wrapText's
      // fast-path returns it verbatim.
      const wrapWidth = Math.floor(layout.width);
      const wrapped = wrapText(text, wrapWidth, node.props.wrap ?? "wrap");
      // Pad each line to the cell width with the INHERITED Box background only —
      // this fills the space behind the text with the Box's bg (the Box also fills
      // it via fillBackground), and is the reason a Box bg pads to full width while
      // a text-only bg does not. The padding uses `inheritedBg`, NOT the effective
      // bg: a Text that overrides or opts out (backgroundColor / "") only recolors
      // its OWN glyphs, never the surrounding Box fill. The already-rendered glyphs
      // in `wrapped[i]` keep their effective bg, so a `backgroundColor=""` Text
      // stays bare even though we pad the trailing cells with the inherited bg.
      // Pad to wrapWidth (NOT a ≥1-clamped width): at width 0 there is nothing to
      // pad, matching Ink (getMaxWidth=0 → no padding). Clamping to 1 here would
      // bg-pad the empty leading wrap line "" into a stray 1-cell fill that
      // collides with a row-sibling at the 0-width box origin.
      if (inheritedBg) {
        const padProps: TextProps = { backgroundColor: inheritedBg };
        for (let i = 0; i < wrapped.length; i++) {
          const pad = wrapWidth - stringWidth(wrapped[i]!);
          if (pad > 0) {
            wrapped[i] = wrapped[i]! + applyChalk(" ".repeat(pad), padProps);
          }
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
      // Standalone <Transform> with DIRECT inline children (bare strings,
      // <Newline>, and no yoga-carrying <Text>/<Box> child): Ink models
      // <Transform> as an ink-text host, so these children render INLINE within
      // the transform's own text — they never reach paintNode as separate write
      // ops. Squash them to a string and write it like a text node, with the
      // transform applied per line via the Output's line-transformers (`next`).
      // Without this the direct text-leaf children would hit the no-op leaf
      // branch and be silently dropped (G58).
      if (!transformHasYogaChild(node)) {
        const text = renderTransformAsText(node, inheritedBg);
        // Empty text: skip so the per-line transform isn't applied to "" (Ink
        // only writes ink-text when squashed text length > 0).
        if (text === "") return;
        const cellWidth = Math.max(1, Math.floor(layout.width));
        const wrapped = wrapText(text, cellWidth, "wrap");
        output.write(x, y, wrapped, next);
        return;
      }
      // Transform wrapping a yoga-carrying child (e.g. <Transform><Text>…)
      // — recurse so the child <Text>/<Box> lays out and paints normally, with
      // the transform pushed onto the line-transformers.
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
  // No staticNode: legacy/simple path — a single iso root sized to the available
  // columns, with the nodes parented directly under it.
  if (!staticNode) {
    return paintUnderRoot(nodes, width, (iso) => iso.yoga.setWidth(width));
  }

  // TWO-LEVEL structure, mirroring Ink's static layout (renderer.ts:30-37,
  // ink.tsx:302-305, Static.tsx). Ink lays the static box out as a
  // `position:absolute`, AUTO-width CHILD of the terminal-width root:
  //
  //   root (yogaNode.setWidth(terminalWidth))  ← containing block for TEXT wrap
  //     └─ staticNode (position:absolute, auto width, flexDirection:column…)
  //          └─ <static items…>
  //
  // and then sizes the static OUTPUT grid from
  // node.staticNode.yogaNode.getComputedWidth()/getComputedHeight()
  // (renderer.ts:32-33) — the computed size of that absolute, auto-width node.
  //
  // Two consequences fall out of this, and BOTH must hold (G64):
  //   • TEXT measures/wraps against the parent root's content width (= terminal
  //     width), so a plain wide <Text> wraps to the terminal and a percent-width
  //     child resolves its percent against the terminal.
  //   • BOXES (explicit width, or a non-shrinking multi-child row) size to their
  //     CONTENT and OVERFLOW past the terminal — the grid is the static node's
  //     content width, which can EXCEED the terminal width.
  //
  // We reproduce this exactly: an outer iso ROOT fixed to `width` (the terminal
  // containing block), and an inner iso BOX that copyStyle's the static node's
  // resolved yoga (carrying flexDirection/padding/gap/justify/align AND an
  // explicit width if one was set — G44) and stays `position:absolute` +
  // auto-width so it content-sizes and overflows. The output grid is sized from
  // the INNER box (not the root), so it equals the content width.
  //
  // (Supersedes b913386's single-root setMaxWidth(columns) approach, which
  // CLAMPED overflow content to the terminal width instead of overflowing.)
  const iso = createIsoRoot({} as never);
  attachYoga(iso);
  iso.yoga.setWidth(width);

  const staticBox = createIsoBox();
  attachYoga(staticBox);
  // copyStyle pulls every resolved layout prop off the static node's yoga
  // (flexDirection — incl. the <Static> column default — padding, margin, gap,
  // justifyContent, alignItems, and an explicit width/height when set). This is
  // the read-back equivalent of Ink reusing node.staticNode.yogaNode, without
  // reparenting the live static node's own yoga children (the main-tree layout
  // stays untouched). (G44)
  staticBox.yoga.copyStyle(staticNode.yoga);
  // attachYoga() sets the static node's OWN yoga to display:none so it occupies
  // no space in the dynamic frame's main-tree layout (yoga.ts:64-68). copyStyle
  // drags that display:none onto the iso box — which would collapse it to 0x0
  // and paint nothing. Force it back to display:flex (it IS the painted box).
  staticBox.yoga.setDisplay(Yoga.DISPLAY_FLEX);
  // Keep position:absolute (Static.tsx's default), the crux of the Ink model:
  // as an absolute, auto-width child of the terminal-width root, the box's
  // children wrap their TEXT against the root's width while the box itself
  // content-sizes and may OVERFLOW the terminal. With no inset, an absolute box
  // resolves to top:0/left:0, so its children paint at the grid origin. (G64)
  staticBox.yoga.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE);

  iso.yoga.insertChild(staticBox.yoga, 0);
  iso.children.push(staticBox);

  // Parent the static content children UNDER the inner box (not the root), so
  // they lay out within the absolute, auto-width static node — exactly the tree
  // Ink builds. We temporarily move only the yoga parentage (never the DOM
  // .parent — see below) and restore it in the finally block.
  type YogaCarrier = { yoga: import("yoga-layout").Node };
  const yogaAdded: Array<{
    yc: YogaCarrier;
    origParent: import("yoga-layout").Node | null;
    origIndex: number;
  }> = [];

  // IMPORTANT: We deliberately do NOT mutate each node's DOM .parent field.
  // The children remain logically owned by their original Static parent — only
  // yoga parentage is temporarily transferred to the inner box for layout.
  // Mutating .parent would leave the original tree with broken back-links and
  // cause renderer.remove() to skip yoga cleanup (seeing parent === null).
  let yIdx = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    // Add to the inner box's children for paint() traversal; do NOT change
    // node.parent.
    staticBox.children.push(node);

    const yCarrier = node as unknown as YogaCarrier;
    // Skip nodes that carry no yoga node (text-leaf, comment, fragment anchors).
    if (!yCarrier.yoga || typeof yCarrier.yoga === "symbol") continue;

    // If the node already has a yoga parent, temporarily remove it so we can
    // re-insert it under the inner box for layout calculation.
    const yParent = (yCarrier.yoga as unknown as { getParent(): import("yoga-layout").Node | null })
      .getParent
      ? (yCarrier.yoga as unknown as { getParent(): import("yoga-layout").Node | null }).getParent()
      : null;
    const origIndex = yParent ? findYogaIndex(yParent, yCarrier.yoga) : 0;
    if (yParent) {
      yParent.removeChild(yCarrier.yoga);
    }
    staticBox.yoga.insertChild(yCarrier.yoga, yIdx);
    yogaAdded.push({ yc: yCarrier, origParent: yParent, origIndex });
    yIdx++;
  }

  let restoreLayoutGuards = () => {};
  try {
    restoreLayoutGuards = calculateLayoutWithContentGuards(
      iso,
      width,
      undefined,
      Yoga.DIRECTION_LTR,
    );
    // Size the output grid from the INNER static box (mirroring Ink
    // renderer.ts:32-33 reading node.staticNode.yogaNode.getComputed*), NOT the
    // root — so the grid equals the content width and can exceed the terminal.
    const boxLayout = staticBox.yoga.getComputedLayout();
    const outW = Math.max(1, Math.floor(boxLayout.width));
    const outH = Math.max(1, Math.floor(boxLayout.height));
    const out = new Output(outW, outH);
    // Paint the inner box's children at the grid origin. The absolute box itself
    // resolves to left:0/top:0; offsetting by -(left/top) keeps children at the
    // origin even if yoga ever computes a non-zero inset.
    const x0 = -Math.floor(boxLayout.left);
    const y0 = -Math.floor(boxLayout.top);
    for (const child of staticBox.children) paintNode(child, out, x0, y0, []);
    return out.get().output;
  } finally {
    restoreLayoutGuards();
    // Restore yoga parents in reverse order so earlier indices remain stable.
    for (const { yc, origParent, origIndex } of yogaAdded.slice().reverse()) {
      staticBox.yoga.removeChild(yc.yoga);
      if (origParent) {
        origParent.insertChild(yc.yoga, origIndex);
      }
    }
    staticBox.children.length = 0;

    // Tear down the temporary two-level iso tree.
    iso.yoga.removeChild(staticBox.yoga);
    detachYoga(staticBox);
    iso.children.length = 0;
    detachYoga(iso);
  }
}

// Paint `nodes` under a single fresh iso root configured by `configureRoot`.
// Children's yoga parentage is temporarily moved under the root for layout and
// restored afterward; DOM .parent pointers are never touched. Used by the
// staticNode-less fallback of paintIsolated.
function paintUnderRoot(
  nodes: TuiNode[],
  width: number,
  configureRoot: (iso: import("../host/nodes.ts").TuiRoot) => void,
): string {
  const iso = createIsoRoot({} as never);
  attachYoga(iso);
  configureRoot(iso);

  type YogaCarrier = { yoga: import("yoga-layout").Node };
  const yogaAdded: Array<{
    yc: YogaCarrier;
    origParent: import("yoga-layout").Node | null;
    origIndex: number;
  }> = [];

  let yIdx = 0;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    iso.children.push(node);

    const yCarrier = node as unknown as YogaCarrier;
    if (!yCarrier.yoga || typeof yCarrier.yoga === "symbol") continue;

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

  let restoreLayoutGuards = () => {};
  try {
    restoreLayoutGuards = calculateLayoutWithContentGuards(
      iso,
      width,
      undefined,
      Yoga.DIRECTION_LTR,
    );
    return paint(iso);
  } finally {
    restoreLayoutGuards();
    for (const { yc, origParent, origIndex } of yogaAdded.slice().reverse()) {
      iso.yoga.removeChild(yc.yoga);
      if (origParent) {
        origParent.insertChild(yc.yoga, origIndex);
      }
    }
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
