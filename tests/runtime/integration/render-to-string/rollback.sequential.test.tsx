// Sequential: interrupted string-render rollback releases the inert stdin context.

import { defineComponent, onScopeDispose } from "vue";
import type { Readable } from "node:stream";
import { expect, test } from "vite-plus/test";
import { renderToString, Text, useStdin } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";

test.sequential("an interrupted initial string patch releases its inert stdin context", () => {
  const disposed: string[] = [];
  let capturedStdin: Readable | undefined;

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
  // Deliberately aligned with Vue: the initial patch threw, so Vue never took
  // container ownership and runs no cleanup of its own. Runtime matches that
  // rather than seeding the missing ownership link from Vue-private state, so
  // no component scope is disposed here. Everything Runtime owns is still
  // released — the inert stdin context and the Yoga allocations proven in
  // integration/lifecycle/yoga-lifecycle.sequential.test.tsx.
  expect(disposed).toEqual([]);
  expect(capturedStdin).toBeDefined();
  expect(capturedStdin?.destroyed).toBe(true);

  const Recovered = defineComponent(() => () => <Text>recovered</Text>);
  expect(renderToString(Recovered)).toBe("recovered");
});
