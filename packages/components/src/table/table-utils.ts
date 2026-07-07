import { Comment } from "vue";
import stringWidth from "string-width";
import type { ColumnConfig, ScalarDict } from "./table-props.ts";
import type { SkeletonKind } from "./table-types.ts";

// =========================================================================
// Pure utility functions and constants for the Table component.
// No Vue reactivity — all stateless and easily testable.
// =========================================================================

export function getDataKeys(data: ScalarDict[]): ColumnConfig[] {
  const keys = new Set<string>();
  for (const row of data) {
    for (const key of Object.keys(row)) {
      keys.add(key);
    }
  }
  return Array.from(keys).map((key) => ({ label: key, key }));
}

export function getRowKey(row: ScalarDict, index: number): string {
  const summary = Object.keys(row)
    .sort()
    .map((key) => `${key}:${String(row[key])}`)
    .join("|");
  return `row-${index}-${summary}`;
}

/**
 * Recursively extract plain text from a VNode tree returned by a slot function.
 * Handles string children, arrays of VNodes, and nested component default slots
 * so we can measure slot content width without a full rendering pipeline.
 */
export function extractVNodeText(node: unknown): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return (node as unknown[]).map(extractVNodeText).join("");

  const vnode = node as Record<string, unknown>;

  // Skip Vue internal comment VNodes (type === Comment symbol).
  // HTML comments in slot templates are preserved as comment VNodes and
  // must not contribute to slot content width measurement.
  if (vnode.type === Comment) return "";

  const children = vnode.children;

  if (typeof children === "string") return children;
  if (Array.isArray(children)) return (children as unknown[]).map(extractVNodeText).join("");
  if (children && typeof children === "object" && "default" in (children as object)) {
    const defaultFn = (children as Record<string, unknown>).default;
    if (typeof defaultFn === "function") {
      return extractVNodeText((defaultFn as () => unknown)());
    }
  }

  return "";
}

/**
 * Map column alignment to Yoga justifyContent for the cell Box.
 * When a slot renders content narrower than the column width, this
 * positions it correctly (left / center / right) within the cell.
 */
export function justifyFromAlign(align: string): "flex-start" | "center" | "flex-end" {
  if (align === "center") return "center";
  if (align === "right") return "flex-end";
  return "flex-start";
}

/**
 * Pad `text` inside a cell of `width` according to `align`, with at least
 * `padSize` spaces on the outer edge(s).
 */
export function padCell(text: string, width: number, align: string, padSize: number): string {
  const textWidth = stringWidth(text);
  if (align === "left") {
    const rightPad = width - textWidth - padSize;
    return `${" ".repeat(padSize)}${text}${" ".repeat(Math.max(0, rightPad))}`;
  }
  if (align === "center") {
    const totalPad = width - textWidth;
    const leftPad = Math.floor(totalPad / 2);
    const rightPad = totalPad - leftPad;
    return `${" ".repeat(Math.max(0, leftPad))}${text}${" ".repeat(Math.max(0, rightPad))}`;
  }
  // right
  const leftPad = width - textWidth - padSize;
  return `${" ".repeat(Math.max(0, leftPad))}${text}${" ".repeat(padSize)}`;
}

export const BORDER_CHARS: Record<
  SkeletonKind,
  { left: string; line: string; cross: string; right: string }
> = {
  top: { left: "┌", line: "─", cross: "┬", right: "┐" },
  separator: { left: "├", line: "─", cross: "┼", right: "┤" },
  bottom: { left: "└", line: "─", cross: "┴", right: "┘" },
  header: { left: "", line: "", cross: "", right: "" },
  data: { left: "", line: "", cross: "", right: "" },
};
