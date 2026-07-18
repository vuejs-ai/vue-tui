import { expect, test } from "vite-plus/test";
import { createBox, createComment, createStatic } from "../host/nodes.ts";
import { prepareStaticOutput } from "./static-channel.ts";

function addAnchor(stat: ReturnType<typeof createStatic>) {
  const anchor = createComment("");
  anchor.parent = stat;
  stat.children.push(anchor);
  return anchor;
}

test("preparing a Static batch does not settle it before output handoff", () => {
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
  expect(stat.commitState).toBe("accepted");
  expect(accepted).toBe(1);

  prepared.accept();
  prepared.abandon();
  expect(accepted).toBe(1);
});

test("an unsettled preparation leaves the Static instance eligible for a later attempt", () => {
  const stat = createStatic();
  addAnchor(stat);
  let accepted = 0;
  stat.onAccepted = () => {
    accepted++;
  };

  const first = prepareStaticOutput(stat, 80);
  expect(first.output).toBe("");
  expect(stat.commitState).toBe("open");

  const retry = prepareStaticOutput(stat, 80);
  retry.accept();
  expect(stat.commitState).toBe("accepted");
  expect(accepted).toBe(1);

  first.accept();
  expect(accepted).toBe(1);
});

test("a successful output-free commit permanently accepts the mounted instance", () => {
  const stat = createStatic();
  addAnchor(stat);
  let accepted = 0;
  stat.onAccepted = () => {
    accepted++;
  };

  const prepared = prepareStaticOutput(stat, 80);
  expect(prepared.output).toBe("");
  prepared.accept();

  expect(stat.commitState).toBe("accepted");
  expect(accepted).toBe(1);
  expect(prepareStaticOutput(stat, 80).output).toBe("");
});

test("an indeterminate write abandons the whole instance, including later child replacement", () => {
  const stat = createStatic();
  const original = addAnchor(stat);
  let accepted = 0;
  stat.onAccepted = () => {
    accepted++;
  };

  const attempted = prepareStaticOutput(stat, 80);
  stat.children.splice(0, 1);
  original.parent = null;
  addAnchor(stat);
  attempted.abandon();

  expect(stat.commitState).toBe("abandoned");
  expect(accepted).toBe(0);

  const later = prepareStaticOutput(stat, 80);
  expect(later.output).toBe("");
  later.accept();
  expect(stat.commitState).toBe("abandoned");
  expect(accepted).toBe(0);
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

test("acceptance seals every Static region before any callback and continues after errors", () => {
  const root = createBox();
  const first = createStatic();
  const second = createStatic();
  root.children.push(first, second);
  first.parent = root;
  second.parent = root;
  addAnchor(first);
  addAnchor(second);
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

  const prepared = prepareStaticOutput(root, 80);
  expect(() => prepared.accept()).toThrow(injected);
  expect(first.commitState).toBe("accepted");
  expect(second.commitState).toBe("accepted");
  expect(secondAccepted).toBe(1);
});
