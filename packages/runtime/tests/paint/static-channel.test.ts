import { expect, test } from "vite-plus/test";
import type { AppContext } from "../../src/vue/context.ts";
import { runLayoutTransaction } from "../../src/layout/layout-transaction.ts";
import { createBox, createComment, createRoot, createStatic } from "../../src/host/nodes.ts";
import { buildNodeOps } from "../../src/vue/node-ops.ts";
import { attachYoga, detachYoga } from "../../src/layout/yoga.ts";
import {
  findStatics,
  prepareStaticOutput as prepareStaticOutputForStyle,
} from "../../src/paint/static-channel.ts";
import { createTerminalStyle } from "../../src/text/terminal-style.ts";
import { encodeFrameHistory } from "../../src/surface/frame-encoder.ts";

const terminalStyle = createTerminalStyle(3);
const prepareStaticOutput = (root: Parameters<typeof findStatics>[0], columns: number) => {
  const dynamicRoot = createRoot({} as AppContext);
  attachYoga(dynamicRoot);
  try {
    const layout = runLayoutTransaction({
      dynamicRoot,
      staticRoots: findStatics(root),
      columns,
      dynamicHeight: { mode: "unbounded" },
    });
    try {
      return prepareStaticOutputForStyle(layout, terminalStyle);
    } finally {
      layout.dispose();
    }
  } finally {
    detachYoga(dynamicRoot);
  }
};

const output = (prepared: ReturnType<typeof prepareStaticOutputForStyle>): string =>
  encodeFrameHistory(prepared.frames);

const ops = buildNodeOps({ onCommit: () => {} });

function addAnchor(stat: ReturnType<typeof createStatic>) {
  const anchor = createComment("");
  anchor.parent = stat;
  stat.children.push(anchor);
  return anchor;
}

function addText(stat: ReturnType<typeof createStatic>, value: string) {
  const text = ops.createElement("tui-text");
  ops.insert(ops.createText(value), text, null);
  ops.insert(text, stat, null);
  return text;
}

function disposeStatic(stat: ReturnType<typeof createStatic>): void {
  for (const child of Array.from(stat.children)) ops.remove(child);
  detachYoga(stat);
}

test("accepting an output-free Static batch leaves its producer open", () => {
  const stat = createStatic();
  addAnchor(stat);
  let accepted = 0;
  stat.onAccepted = () => {
    accepted++;
  };

  const prepared = prepareStaticOutput(stat, 80);

  expect(output(prepared)).toBe("");
  expect(stat.commitState).toBe("open");
  expect(accepted).toBe(0);

  prepared.accept();
  expect(stat.commitState).toBe("open");
  expect(accepted).toBe(0);

  prepared.accept();
  prepared.abandon();
  expect(stat.commitState).toBe("open");
  expect(accepted).toBe(0);
});

test("a later non-empty preparation accepts an output-free Static producer once", () => {
  const stat = ops.createElement("tui-static") as ReturnType<typeof createStatic>;
  const anchor = ops.createComment("");
  ops.insert(anchor, stat, null);
  let accepted = 0;
  stat.onAccepted = () => {
    accepted++;
  };

  try {
    const first = prepareStaticOutput(stat, 80);
    expect(output(first)).toBe("");
    expect(stat.commitState).toBe("open");

    ops.remove(anchor);
    addText(stat, "later");
    const retry = prepareStaticOutput(stat, 80);
    expect(output(retry)).toBe("later\n");
    retry.accept();
    expect(stat.commitState).toBe("accepted");
    expect(accepted).toBe(1);

    first.accept();
    expect(accepted).toBe(1);
  } finally {
    disposeStatic(stat);
  }
});

test("an output-free preparation cannot abandon content produced later", () => {
  const stat = ops.createElement("tui-static") as ReturnType<typeof createStatic>;
  const anchor = ops.createComment("");
  ops.insert(anchor, stat, null);
  let accepted = 0;
  stat.onAccepted = () => {
    accepted++;
  };

  try {
    const emptyAttempt = prepareStaticOutput(stat, 80);
    ops.remove(anchor);
    addText(stat, "ready");
    emptyAttempt.abandon();

    expect(stat.commitState).toBe("open");
    const readyAttempt = prepareStaticOutput(stat, 80);
    expect(output(readyAttempt)).toBe("ready\n");
    readyAttempt.accept();
    expect(stat.commitState).toBe("accepted");
    expect(accepted).toBe(1);
  } finally {
    disposeStatic(stat);
  }
});

test("an indeterminate write abandons the whole instance, including later child replacement", () => {
  const stat = ops.createElement("tui-static") as ReturnType<typeof createStatic>;
  const original = addText(stat, "first");
  let accepted = 0;
  stat.onAccepted = () => {
    accepted++;
  };

  try {
    const attempted = prepareStaticOutput(stat, 80);
    expect(output(attempted)).toBe("first\n");
    ops.remove(original);
    addText(stat, "replacement");
    attempted.abandon();

    expect(stat.commitState).toBe("abandoned");
    expect(accepted).toBe(0);

    const later = prepareStaticOutput(stat, 80);
    expect(output(later)).toBe("");
    later.accept();
    expect(stat.commitState).toBe("abandoned");
    expect(accepted).toBe(0);
  } finally {
    disposeStatic(stat);
  }
});

test("preparation rejects nested Static hosts before producing output", () => {
  const outer = createStatic();
  const inner = createStatic();
  inner.parent = outer;
  outer.children.push(inner);
  addAnchor(inner);

  expect(() => prepareStaticOutput(outer, 80)).toThrow(
    "<Static> cannot be nested inside another <Static>",
  );
  expect(outer.commitState).toBe("open");
  expect(inner.commitState).toBe("open");
});

test("a non-empty sibling commits without consuming an output-free Static producer", () => {
  const root = createBox();
  const ready = ops.createElement("tui-static") as ReturnType<typeof createStatic>;
  const pending = ops.createElement("tui-static") as ReturnType<typeof createStatic>;
  root.children.push(ready, pending);
  ready.parent = root;
  pending.parent = root;
  addText(ready, "ready");
  const pendingAnchor = ops.createComment("");
  ops.insert(pendingAnchor, pending, null);

  try {
    const first = prepareStaticOutput(root, 80);
    expect(output(first)).toBe("ready\n");
    first.accept();
    expect(ready.commitState).toBe("accepted");
    expect(pending.commitState).toBe("open");

    ops.remove(pendingAnchor);
    addText(pending, "later");
    const second = prepareStaticOutput(root, 80);
    expect(output(second)).toBe("later\n");
    second.accept();
    expect(pending.commitState).toBe("accepted");
  } finally {
    ready.parent = null;
    pending.parent = null;
    disposeStatic(ready);
    disposeStatic(pending);
  }
});

test("acceptance seals every Static region before any callback and continues after errors", () => {
  const root = createBox();
  const first = ops.createElement("tui-static") as ReturnType<typeof createStatic>;
  const second = ops.createElement("tui-static") as ReturnType<typeof createStatic>;
  root.children.push(first, second);
  first.parent = root;
  second.parent = root;
  addText(first, "first");
  addText(second, "second");
  const injected = new Error("first acceptance callback failed");
  const events: string[] = [];
  first.onAccepted = () => {
    expect(first.commitState).toBe("accepted");
    expect(second.commitState).toBe("accepted");
    events.push("first");
    throw injected;
  };
  second.onAccepted = () => {
    events.push("second");
  };

  try {
    const prepared = prepareStaticOutput(root, 80);
    expect(output(prepared)).toBe("first\nsecond\n");
    expect(() =>
      prepared.accept(() => {
        events.push("before");
        return () => events.push("after");
      }),
    ).toThrow(injected);
    expect(first.commitState).toBe("accepted");
    expect(second.commitState).toBe("accepted");
    expect(events).toEqual(["before", "first", "second", "after"]);
  } finally {
    first.parent = null;
    second.parent = null;
    disposeStatic(first);
    disposeStatic(second);
  }
});

test("a blank multi-row Static batch commits its producer", () => {
  const stat = ops.createElement("tui-static") as ReturnType<typeof createStatic>;
  const anchor = ops.createComment("");
  ops.insert(anchor, stat, null);
  addText(stat, " \n ");
  let accepted = 0;
  stat.onAccepted = () => {
    accepted++;
  };

  const prepared = prepareStaticOutput(stat, 80);

  // Blank rows are still output: they advance the cursor and occupy history, so
  // the producer must settle rather than stay open and repaint forever.
  expect(output(prepared)).not.toBe("");
  prepared.accept();
  expect(stat.commitState).toBe("accepted");
  expect(accepted).toBe(1);

  disposeStatic(stat);
});
