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
import { wrapText } from "../host/text-measure.ts";
import {
  attachYoga,
  detachYoga,
  isYogaProp as isYogaPropFn,
  applyYogaProp as applyYogaPropFn,
} from "../host/yoga.ts";

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
        const clipH = typeof clip.x1 === "number" && typeof clip.x2 === "number";
        const clipV = typeof clip.y1 === "number" && typeof clip.y2 === "number";

        // If text is positioned outside of clipping area altogether, skip
        if (clipH) {
          const text = lines.join("\n");
          const width = this.caches.getWidestLine(text);
          if (x + width < clip.x1! || x > clip.x2!) continue;
        }

        if (clipV) {
          const height = lines.length;
          if (y + height < clip.y1! || y > clip.y2!) continue;
        }

        if (clipH) {
          lines = lines.map((line) => {
            const from = x < clip.x1! ? clip.x1! - x : 0;
            const lineWidth = this.caches.getStringWidth(line);
            const to = x + lineWidth > clip.x2! ? clip.x2! - x : lineWidth;
            return sliceAnsi(line, from, to);
          });
          if (x < clip.x1!) x = clip.x1!;
        }

        if (clipV) {
          const from = y < clip.y1! ? clip.y1! - y : 0;
          const height = lines.length;
          const to = y + height > clip.y2! ? clip.y2! - y : height;
          lines = lines.slice(from, to);
          if (y < clip.y1!) y = clip.y1!;
        }
      }

      let offsetY = 0;

      for (let [index, line] of lines.entries()) {
        const currentLine = output[y + offsetY];

        // Line can be missing if text is taller than pre-initialized output
        if (!currentLine) {
          continue;
        }

        for (const transformer of transformers) {
          line = transformer(line, index);
        }

        const characters = this.caches.getStyledChars(line);
        let offsetX = x;

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
          currentLine[offsetX] = character;

          // Determine printed width using string-width to align with measurement
          const characterWidth = Math.max(1, this.caches.getStringWidth(character.value));

          // For multi-column characters, clear following cells to avoid stray spaces/artifacts
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
  for (const child of node.children) {
    if (child.type === "text-leaf") {
      out += applyChalk(child.value, merged);
    } else if (child.type === "virtual-text") {
      out += renderTextWithInlineStyles(child, merged);
    } else if (child.type === "transform") {
      // Recurse into the transform's children, then apply the transform function.
      // This mirrors Ink's squashTextNodes behavior for <Transform> inside <Text>.
      // Only apply the transform when there is actual text content — Ink skips
      // transforms on empty text to avoid wrapping empty strings.
      let innerText = "";
      for (const grandchild of child.children) {
        if (grandchild.type === "text-leaf") {
          innerText += applyChalk(grandchild.value, merged);
        } else if (grandchild.type === "virtual-text" || grandchild.type === "text") {
          innerText += renderTextWithInlineStyles(grandchild, merged);
        }
      }
      if (innerText.length > 0 && child.transform) {
        innerText = child.transform(innerText, 0);
      }
      out += innerText;
    }
    // Skip comments inserted by Vue for null/undefined renders
  }
  return sanitizeAnsi(out);
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
  const style = props["borderStyle"] as string | undefined;
  if (!style) return;
  const chars = (cliBoxes as unknown as Record<string, BoxStyle | undefined>)[style];
  if (!chars) return;
  if (w < 2 || h < 2) return;

  const top = props["borderTop"] !== false;
  const bottom = props["borderBottom"] !== false;
  const left = props["borderLeft"] !== false;
  const right = props["borderRight"] !== false;

  const borderColor = props["borderColor"] as string | undefined;
  const bgColor = props["backgroundColor"] as string | undefined;
  const dimAll = !!props["borderDimColor"];

  function colorizeEdge(s: string, edge: "top" | "bottom" | "left" | "right"): string {
    const capEdge = edge.charAt(0).toUpperCase() + edge.slice(1);
    const edgeColor = (props[`border${capEdge}Color`] as string | undefined) ?? borderColor;
    const edgeDim = (props[`border${capEdge}DimColor`] as boolean | undefined) || dimAll;
    const edgeBg =
      (props[`border${capEdge}BackgroundColor`] as string | undefined) ??
      (props["borderBackgroundColor"] as string | undefined) ??
      bgColor;
    const p: TextProps = {};
    if (edgeColor) p.color = edgeColor;
    if (edgeBg) p.backgroundColor = edgeBg;
    if (edgeDim) p.dimColor = true;
    return Object.keys(p).length > 0 ? applyChalk(s, p) : s;
  }

  if (top) {
    const tl = left ? chars.topLeft : chars.top;
    const tr = right ? chars.topRight : chars.top;
    output.write(x, y, [colorizeEdge(tl + chars.top.repeat(w - 2) + tr, "top")], transformers);
  }
  if (bottom) {
    const bl = left ? chars.bottomLeft : chars.bottom;
    const br = right ? chars.bottomRight : chars.bottom;
    output.write(
      x,
      y + h - 1,
      [colorizeEdge(bl + chars.bottom.repeat(w - 2) + br, "bottom")],
      transformers,
    );
  }
  for (let i = 1; i < h - 1; i++) {
    if (left) output.write(x, y + i, [colorizeEdge(chars.left, "left")], transformers);
    if (right) output.write(x + w - 1, y + i, [colorizeEdge(chars.right, "right")], transformers);
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
  iso.yoga.setWidth(width);

  // Apply the static node's yoga props (padding, flexDirection, etc.) to the
  // iso root so the isolated layout reflects the Static wrapper's style.
  if (staticNode) {
    for (const [key, value] of Object.entries(staticNode.props)) {
      if (isYogaPropFn(key)) {
        applyYogaPropFn(iso, key, value);
      }
    }
    // Static component defaults: position: absolute, flexDirection: column.
    // These are set via the component's render function as Vue props, but for
    // the iso root we need to mirror the yoga state that was on the real
    // static node. Copy the key yoga settings that define layout direction.
    // The static node's own yoga state already has these applied, but the iso
    // root is fresh — we need to explicitly set flexDirection for correct layout.
    if (!("flexDirection" in staticNode.props)) {
      iso.yoga.setFlexDirection(Yoga.FLEX_DIRECTION_COLUMN);
    }
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
