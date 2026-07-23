import { expect, test } from "vite-plus/test";
import { createBox, createComment, createStatic } from "../host/nodes.ts";
import { buildNodeOps } from "../host/node-ops.ts";
import { detachYoga } from "../host/yoga.ts";
import { prepareStaticOutput } from "./static-channel.ts";

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

  expect(prepared.output).toBe("");
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
    expect(first.output).toBe("");
    expect(stat.commitState).toBe("open");

    ops.remove(anchor);
    addText(stat, "later");
    const retry = prepareStaticOutput(stat, 80);
    expect(retry.output).toBe("later\n");
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
    expect(readyAttempt.output).toBe("ready\n");
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
    expect(attempted.output).toBe("first\n");
    ops.remove(original);
    addText(stat, "replacement");
    attempted.abandon();

    expect(stat.commitState).toBe("abandoned");
    expect(accepted).toBe(0);

    const later = prepareStaticOutput(stat, 80);
    expect(later.output).toBe("");
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
    expect(first.output).toBe("ready\n");
    first.accept();
    expect(ready.commitState).toBe("accepted");
    expect(pending.commitState).toBe("open");

    ops.remove(pendingAnchor);
    addText(pending, "later");
    const second = prepareStaticOutput(root, 80);
    expect(second.output).toBe("later\n");
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
  let secondAccepted = 0;
  first.onAccepted = () => {
    expect(first.commitState).toBe("accepted");
    expect(second.commitState).toBe("accepted");
    throw injected;
  };
  second.onAccepted = () => {
    secondAccepted++;
  };

  try {
    const prepared = prepareStaticOutput(root, 80);
    expect(prepared.output).toBe("first\nsecond\n");
    expect(() => prepared.accept()).toThrow(injected);
    expect(first.commitState).toBe("accepted");
    expect(second.commitState).toBe("accepted");
    expect(secondAccepted).toBe(1);
  } finally {
    first.parent = null;
    second.parent = null;
    disposeStatic(first);
    disposeStatic(second);
  }
});
