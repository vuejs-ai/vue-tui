// Sequential: this regression compares process-global Runtime and Yoga
// ownership counters, which concurrent renderers would perturb.

import { defineComponent, onScopeDispose } from "vue";
import type { Readable } from "node:stream";
import { expect, test } from "vite-plus/test";
import { renderToString, Text, useStdin } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import {
  runtimeResourceTracker,
  useStderr,
  useStdout,
  yogaNodeTracker,
} from "../../runtime/dist/internal.mjs";

test.sequential("an interrupted initial string patch rolls back scopes, streams, and Yoga hosts", () => {
  const resourcesBefore = runtimeResourceTracker.snapshot();
  const yogaBefore = yogaNodeTracker.snapshot();
  const disposed: string[] = [];
  let capturedStdin: Readable | undefined;
  let capturedStdout: NodeJS.WriteStream | undefined;
  let capturedStderr: NodeJS.WriteStream | undefined;

  const Leaf = defineComponent(() => {
    onScopeDispose(() => disposed.push("leaf"));
    return () => <Text>leaf</Text>;
  });
  const Inner = defineComponent(() => {
    onScopeDispose(() => disposed.push("inner"));
    return () => (
      <Static>
        <Leaf />
      </Static>
    );
  });
  const App = defineComponent(() => {
    onScopeDispose(() => disposed.push("app"));
    capturedStdin = useStdin().stdin;
    capturedStdout = useStdout().stdout;
    capturedStderr = useStderr().stderr;
    return () => (
      <Static>
        <Text>outer</Text>
        <Inner />
      </Static>
    );
  });

  let thrown: unknown;
  try {
    renderToString(App);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toBe("<Static> cannot be nested inside another <Static>");
  expect(disposed.sort()).toEqual(["app", "inner", "leaf"]);
  expect(capturedStdin).toBeDefined();
  expect(capturedStdout).toBeDefined();
  expect(capturedStderr).toBeDefined();
  expect(capturedStdin?.destroyed).toBe(true);
  expect(capturedStdout?.destroyed).toBe(true);
  expect(capturedStderr?.destroyed).toBe(true);

  const Recovered = defineComponent(() => () => <Text>recovered</Text>);
  expect(renderToString(Recovered)).toBe("recovered");
  expect(runtimeResourceTracker.snapshot()).toEqual(resourcesBefore);

  const yogaAfter = yogaNodeTracker.snapshot();
  const created = yogaAfter.created - yogaBefore.created;
  const freed = yogaAfter.freed - yogaBefore.freed;
  expect(created).toBeGreaterThan(1);
  expect(freed).toBe(created);
  expect(yogaAfter.live).toBe(yogaBefore.live);
});
