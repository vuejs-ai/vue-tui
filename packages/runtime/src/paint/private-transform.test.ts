import Yoga from "yoga-layout";
import { expect, test } from "vite-plus/test";
import type { AppContext } from "../context.ts";
import { calculateLayoutWithContentGuards } from "../host/layout-guards.ts";
import { buildNodeOps } from "../host/node-ops.ts";
import {
  createRoot,
  type TuiBox,
  type TuiNode,
  type TuiText,
  type TuiTransform,
} from "../host/nodes.ts";
import { attachYoga, detachYoga } from "../host/yoga.ts";
import { paint, releasePaintCaches } from "./paint.ts";

const ops = buildNodeOps({ onCommit: () => {} });

function fixture(width = 12) {
  const root = createRoot({} as AppContext);
  attachYoga(root);
  root.yoga.setWidth(width);

  return {
    root,
    box(props: Record<string, unknown> = {}): TuiBox {
      const node = ops.createElement("tui-box") as TuiBox;
      for (const [key, value] of Object.entries(props)) {
        ops.patchProp(node, key, undefined, value);
      }
      return node;
    },
    transform(callback: (line: string, lineIndex: number) => string): TuiTransform {
      const node = ops.createElement("tui-transform") as TuiTransform;
      ops.patchProp(node, "transform", undefined, callback);
      return node;
    },
    text(value: string): { node: TuiText; leaf: TuiNode } {
      const node = ops.createElement("tui-text") as TuiText;
      const leaf = ops.createText(value);
      ops.insert(leaf, node, null);
      return { node, leaf };
    },
    insert(parent: TuiNode, child: TuiNode): void {
      ops.insert(child, parent, null);
    },
    paint(viewport = { width, height: 4 }): string {
      const restore = calculateLayoutWithContentGuards(
        root,
        viewport.width,
        undefined,
        Yoga.DIRECTION_LTR,
      );
      try {
        return paint(root, { viewport });
      } finally {
        restore();
      }
    },
    dispose(): void {
      for (const child of root.children.slice()) ops.remove(child);
      releasePaintCaches(root);
      detachYoga(root);
    },
  };
}

test("private raw Transform lays out direct text and transforms each painted line", () => {
  const f = fixture();
  const transform = f.transform((line, lineIndex) => `${lineIndex}:${line.toUpperCase()}`);
  f.insert(transform, ops.createText("ab\ncd"));
  f.insert(f.root, transform);

  try {
    expect(f.paint()).toBe("0:AB\n1:CD\n\n");
    expect(transform.yoga.getComputedLayout().height).toBe(2);
  } finally {
    f.dispose();
  }
});

test("private raw Transform remeasures after its Text child changes", () => {
  const f = fixture();
  const transform = f.transform((line) => line.toUpperCase());
  const text = f.text("a");
  f.insert(transform, text.node);
  f.insert(f.root, transform);

  try {
    expect(f.paint({ width: 12, height: 1 })).toBe("A");
    expect(transform.yoga.getComputedLayout().height).toBe(1);

    ops.setText(text.leaf, "a\nb\nc");

    expect(f.paint({ width: 12, height: 3 })).toBe("A\nB\nC");
    expect(transform.yoga.getComputedLayout().height).toBe(3);
  } finally {
    f.dispose();
  }
});

test("private raw Transform cannot introduce terminal geometry controls", () => {
  const f = fixture(20);
  const transform = f.transform(() => "A\nB\x1b[2JC");
  const text = f.text("x");
  f.insert(transform, text.node);
  f.insert(f.root, transform);

  try {
    expect(f.paint({ width: 20, height: 1 })).toBe("ABC");
  } finally {
    f.dispose();
  }
});

test("private raw Transform expansion stays inside the terminal viewport", () => {
  const f = fixture(4);
  const transform = f.transform(() => "Y".repeat(101));
  const text = f.text("x");
  f.insert(transform, text.node);
  f.insert(f.root, transform);

  try {
    expect(f.paint({ width: 4, height: 1 })).toBe("YYYY");
  } finally {
    f.dispose();
  }
});

test("private raw Transform receives the clipped span without shifting retained source columns", () => {
  const f = fixture(12);
  const seen: string[] = [];
  const outer = f.box({ width: 4, height: 1, overflow: "hidden" });
  const positioned = f.box({ position: "absolute", left: -1, flexShrink: 0 });
  const transform = f.transform((line) => {
    seen.push(line);
    return line;
  });
  const text = f.text("中x");
  f.insert(transform, text.node);
  f.insert(positioned, transform);
  f.insert(outer, positioned);
  f.insert(f.root, outer);

  try {
    expect(f.paint({ width: 12, height: 1 })).toBe(" x");
    expect(seen).toEqual(["x"]);
  } finally {
    f.dispose();
  }
});

test("private raw Transform expansion cannot reopen a narrower overflow ancestor", () => {
  const f = fixture(12);
  const outer = f.box({ width: 4, height: 1, overflow: "hidden" });
  const inner = f.box({ width: 8, height: 1, overflow: "hidden", flexShrink: 0 });
  const transform = f.transform(() => "Y".repeat(8));
  const text = f.text("x");
  f.insert(transform, text.node);
  f.insert(inner, transform);
  f.insert(outer, inner);
  f.insert(f.root, outer);

  try {
    expect(f.paint({ width: 12, height: 1 })).toBe("YYYY");
  } finally {
    f.dispose();
  }
});

test.each([
  ["constant", () => "中"],
  ["appending", (line: string) => `${line}X`],
] as const)(
  "private raw Transform %s output stays hidden at an ancestor's exclusive right edge",
  (_name, callback) => {
    const f = fixture(12);
    const outer = f.box({ width: 4, height: 1, overflow: "hidden" });
    const positioned = f.box({ position: "absolute", left: 4, flexShrink: 0 });
    const transform = f.transform(callback);
    const text = f.text("q");
    f.insert(transform, text.node);
    f.insert(positioned, transform);
    f.insert(outer, positioned);
    f.insert(f.root, outer);

    try {
      expect(f.paint({ width: 12, height: 1 })).toBe("");
    } finally {
      f.dispose();
    }
  },
);
