import { expect, test } from "vite-plus/test";
import { createBox, createComment, createStatic } from "../host/nodes.ts";
import { prepareStaticOutput } from "./static-channel.ts";

test("preparing a Static batch does not accept it before output handoff", () => {
  const stat = createStatic();
  const anchor = createComment("");
  anchor.parent = stat;
  stat.children.push(anchor);
  let accepted = 0;
  stat.onWritten = () => {
    accepted++;
  };

  const prepared = prepareStaticOutput(stat, 80);

  expect(prepared.output).toBe("");
  expect(stat.writtenNodes.size).toBe(0);
  expect(accepted).toBe(0);

  prepared.accept();
  expect(stat.writtenNodes).toEqual(new Set([anchor]));
  expect(accepted).toBe(1);

  prepared.accept();
  prepared.abandon();
  expect(accepted).toBe(1);
});

test("an unaccepted preparation leaves the Static batch eligible for a later attempt", () => {
  const stat = createStatic();
  const anchor = createComment("");
  anchor.parent = stat;
  stat.children.push(anchor);
  let accepted = 0;
  stat.onWritten = () => {
    accepted++;
  };

  const first = prepareStaticOutput(stat, 80);
  expect(first.output).toBe("");
  expect(stat.writtenNodes.size).toBe(0);

  const retry = prepareStaticOutput(stat, 80);
  retry.accept();
  expect(stat.writtenNodes).toEqual(new Set([anchor]));
  expect(accepted).toBe(1);
});

test("acceptance reports the item prefix captured during preparation", () => {
  const stat = createStatic();
  const anchor = createComment("");
  anchor.parent = stat;
  stat.children.push(anchor);
  stat.renderedThrough = 1;
  const accepted: number[] = [];
  stat.onWritten = (renderedThrough) => {
    accepted.push(renderedThrough);
  };

  const prepared = prepareStaticOutput(stat, 80);
  stat.renderedThrough = 2;
  prepared.accept();

  expect(accepted).toEqual([1]);
});

test("an indeterminate Static write is settled without reporting acceptance", () => {
  const stat = createStatic();
  const anchor = createComment("");
  anchor.parent = stat;
  stat.children.push(anchor);
  let accepted = 0;
  stat.onWritten = () => {
    accepted++;
  };

  const attempted = prepareStaticOutput(stat, 80);
  attempted.abandon();
  expect(stat.writtenNodes).toEqual(new Set([anchor]));
  expect(accepted).toBe(0);

  // A later renderer commit sees no fresh node to retry and must not turn the
  // indeterminate attempt into a false acceptance notification.
  const later = prepareStaticOutput(stat, 80);
  expect(later.output).toBe("");
  later.accept();
  expect(accepted).toBe(0);
});

test("acceptance settles and notifies every Static region before propagating a callback error", () => {
  const root = createBox();
  const first = createStatic();
  const second = createStatic();
  const firstAnchor = createComment("");
  const secondAnchor = createComment("");
  root.children.push(first, second);
  first.parent = root;
  second.parent = root;
  first.children.push(firstAnchor);
  second.children.push(secondAnchor);
  firstAnchor.parent = first;
  secondAnchor.parent = second;
  const injected = new Error("first acceptance callback failed");
  let secondAccepted = 0;
  first.onWritten = () => {
    throw injected;
  };
  second.onWritten = () => {
    secondAccepted++;
  };

  const prepared = prepareStaticOutput(root, 80);
  expect(() => prepared.accept()).toThrow(injected);
  expect(first.writtenNodes).toEqual(new Set([firstAnchor]));
  expect(second.writtenNodes).toEqual(new Set([secondAnchor]));
  expect(secondAccepted).toBe(1);
});
