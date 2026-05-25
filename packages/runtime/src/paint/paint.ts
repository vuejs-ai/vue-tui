import stringWidth from "string-width";
import cliBoxes from "cli-boxes";
import { applyChalk } from "./text-style.ts";
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
import { attachYoga, detachYoga } from "../host/yoga.ts";

export type Transformer = (line: string, lineIndex: number) => string;

interface WriteOp {
  x: number;
  y: number;
  lines: string[];
  transformers: Transformer[];
}

class Output {
  readonly width: number;
  readonly height: number;
  private ops: WriteOp[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  write(x: number, y: number, lines: string[], transformers: Transformer[]): void {
    this.ops.push({ x, y, lines, transformers });
  }

  get(): string {
    // Build a sparse grid of cells, write each op left-to-right.
    const grid: string[][] = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => " "),
    );
    for (const op of this.ops) {
      for (let lineIdx = 0; lineIdx < op.lines.length; lineIdx++) {
        let line = op.lines[lineIdx]!;
        for (const tf of op.transformers) line = tf(line, lineIdx);
        placeLine(grid, op.x, op.y + lineIdx, line);
      }
    }
    return grid.map((row) => row.join("").trimEnd()).join("\n");
  }
}

function placeLine(grid: string[][], x: number, y: number, line: string): void {
  if (y < 0 || y >= grid.length) return;
  const row = grid[y]!;
  // We walk the line as visual cells. ANSI sequences are kept attached to the
  // cell that follows them; emoji/wide chars consume two cells.
  let col = x;
  let i = 0;
  let pendingAnsi = "";
  while (i < line.length && col < row.length) {
    const ch = line[i]!;
    // ANSI CSI sequence: ESC[...m — accumulate as a prefix for the next cell.
    if (ch === "\x1b" && line[i + 1] === "[") {
      const end = line.indexOf("m", i);
      if (end >= 0) {
        pendingAnsi += line.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    const segment = ch;
    const w = stringWidth(segment);
    if (col >= 0 && col < row.length) {
      row[col] = pendingAnsi + segment;
      pendingAnsi = "";
    }
    if (w === 2 && col + 1 < row.length) row[col + 1] = "";
    col += Math.max(1, w);
    i++;
  }
  // If the line ended with a trailing escape (e.g. reset), attach it to the
  // last written cell so it's not lost.
  if (pendingAnsi && col > x) {
    const lastCol = Math.min(col - 1, row.length - 1);
    if (lastCol >= 0) row[lastCol] = (row[lastCol] ?? "") + pendingAnsi;
  }
}

function renderTextWithInlineStyles(node: TuiText | TuiVirtualText, acc: TextProps = {}): string {
  const defined = Object.fromEntries(
    Object.entries(node.props).filter(([, v]) => v !== undefined),
  );
  const merged: TextProps = { ...acc, ...defined };
  let out = "";
  for (const child of node.children) {
    if (child.type === "text-leaf") {
      out += applyChalk(child.value, merged);
    } else {
      out += renderTextWithInlineStyles(child, merged);
    }
  }
  return out;
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
  const colorProps: TextProps = {};
  if (borderColor) colorProps.color = borderColor;
  if (bgColor) colorProps.backgroundColor = bgColor;
  const colorize = (s: string) => (borderColor || bgColor ? applyChalk(s, colorProps) : s);

  if (top) {
    const tl = left ? chars.topLeft : chars.top;
    const tr = right ? chars.topRight : chars.top;
    output.write(x, y, [colorize(tl + chars.top.repeat(w - 2) + tr)], transformers);
  }
  if (bottom) {
    const bl = left ? chars.bottomLeft : chars.bottom;
    const br = right ? chars.bottomRight : chars.bottom;
    output.write(x, y + h - 1, [colorize(bl + chars.bottom.repeat(w - 2) + br)], transformers);
  }
  for (let i = 1; i < h - 1; i++) {
    if (left) output.write(x, y + i, [colorize(chars.left)], transformers);
    if (right) output.write(x + w - 1, y + i, [colorize(chars.right)], transformers);
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
  const output = new Output(width, height);
  paintNode(root, output, 0, 0, []);
  return output.get();
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
      if (node.props["backgroundColor"]) {
        fillBackground(output, x, y, w, h, node.props["backgroundColor"], transformers);
      }
      if (node.props["borderStyle"]) {
        drawBorder(output, x, y, w, h, node.props, transformers);
      }
      for (const child of node.children) paintNode(child, output, x, y, transformers, bg);
      return;
    }
    case "text": {
      const layout = node.yoga.getComputedLayout();
      const bgProps: TextProps = inheritedBg ? { backgroundColor: inheritedBg } : {};
      const text = renderTextWithInlineStyles(node, bgProps);
      const wrapped = wrapText(
        text,
        Math.max(1, Math.floor(layout.width)),
        node.props.wrap ?? "wrap",
      );
      output.write(x0 + layout.left, y0 + layout.top, wrapped, transformers);
      return;
    }
    case "static": {
      // Static is rendered through the static channel (written before frame), so
      // it does not contribute to the dynamic frame paint.
      return;
    }
    case "transform": {
      const next = [...transformers, node.transform];
      for (const child of node.children) paintNode(child, output, x0, y0, next, inheritedBg);
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

export function paintIsolated(nodes: TuiNode[], width: number): string {
  const iso = createIsoRoot({} as never);
  attachYoga(iso);
  iso.yoga.setWidth(width);

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
