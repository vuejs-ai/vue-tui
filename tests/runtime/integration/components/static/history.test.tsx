import { defineComponent, onErrorCaptured, onScopeDispose, onUnmounted, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { countOccurrences, flush, staticTranscript } from "./harness.ts";

test("keyed Static instances commit initial and appended Vue items once", async () => {
  const entries = shallowRef([{ id: 1, text: "A" }]);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {entries.value.map((entry) => (
        <Static key={entry.id}>
          <Text>{entry.text}</Text>
        </Static>
      ))}
      <Text>[live]</Text>
    </Box>
  ));

  const result = await render(App);
  expect(staticTranscript(result.frames)).toBe("A\n");
  expect(result.lastFrame()).toBe("[live]");

  entries.value = [...entries.value, { id: 2, text: "B" }];
  await flush(result);

  const transcript = staticTranscript(result.frames);
  expect(transcript).toBe("A\nB\n");
  expect(countOccurrences(transcript, "A")).toBe(1);
  expect(countOccurrences(transcript, "B")).toBe(1);
  expect(result.lastFrame()).toBe("[live]");
});

test("accepted instances ignore slot updates and keyed reorder", async () => {
  const entries = shallowRef([
    { id: 1, text: "A" },
    { id: 2, text: "B" },
  ]);
  const App = defineComponent(() => () => (
    <Box>
      {entries.value.map((entry) => (
        <Static key={entry.id}>
          <Text>{entry.text}</Text>
        </Static>
      ))}
      <Text>[live]</Text>
    </Box>
  ));

  const result = await render(App);
  expect(staticTranscript(result.frames)).toBe("A\nB\n");

  entries.value = [
    { id: 2, text: "changed-B" },
    { id: 1, text: "changed-A" },
  ];
  await flush(result);

  expect(staticTranscript(result.frames)).toBe("A\nB\n");
  expect(result.lastFrame()).toBe("[live]");
});

test("changing the Vue key remounts Static and commits a new block", async () => {
  const identity = shallowRef(1);
  const text = shallowRef("first");
  const App = defineComponent(() => () => (
    <Static key={identity.value}>
      <Text>{text.value}</Text>
    </Static>
  ));

  const result = await render(App);
  expect(staticTranscript(result.frames)).toBe("first\n");

  text.value = "ignored";
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("first\n");

  text.value = "second";
  identity.value++;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("first\nsecond\n");
});

test("a visually blank Static stays open until its first later non-empty output", async () => {
  const ready = shallowRef(false);
  const value = shallowRef("first");
  const unmounted: string[] = [];
  const Deferred = defineComponent(() => {
    onUnmounted(() => unmounted.push("deferred"));
    return () => <Text>{ready.value ? value.value : "\u00a0"}</Text>;
  });
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static>
        <Deferred />
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const result = await render(App);
  expect(staticTranscript(result.frames)).toBe("");
  expect(unmounted).toEqual([]);

  ready.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("first\n");
  expect(unmounted).toEqual(["deferred"]);

  value.value = "ignored";
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("first\n");
});

test("accepting a ready sibling leaves an output-free Static open for later content", async () => {
  const ready = shallowRef(false);
  const completed = shallowRef(["IMMEDIATE"]);
  const Deferred = defineComponent(() => () => <Text>{ready.value ? "DEFERRED" : ""}</Text>);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static key="deferred">
        <Deferred />
      </Static>
      {completed.value.map((value) => (
        <Static key={value}>
          <Text>{value}</Text>
        </Static>
      ))}
      <Text>[live]</Text>
    </Box>
  ));

  const result = await render(App);
  expect(staticTranscript(result.frames)).toBe("IMMEDIATE\n");

  ready.value = true;
  completed.value = [...completed.value, "SIMULTANEOUS"];
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("IMMEDIATE\nDEFERRED\nSIMULTANEOUS\n");
});

test("unmounting an open output-free Static produces no history block", async () => {
  const mounted = shallowRef(true);
  const ready = shallowRef(false);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {mounted.value ? <Static>{ready.value ? <Text>LATE</Text> : null}</Static> : null}
      <Text>[live]</Text>
    </Box>
  ));

  const result = await render(App);
  expect(staticTranscript(result.frames)).toBe("");
  mounted.value = false;
  await flush(result);
  ready.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("");

  mounted.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("LATE\n");
});

test("conditional unmount preserves committed history and remount repeats a fresh block", async () => {
  const mounted = shallowRef(true);
  const App = defineComponent(
    () => () =>
      mounted.value ? (
        <Static key="repeatable">
          <Text>A</Text>
        </Static>
      ) : null,
  );

  const result = await render(App);
  expect(staticTranscript(result.frames)).toBe("A\n");

  mounted.value = false;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("A\n");

  mounted.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("A\nA\n");
});

test("open sibling instances commit in current tree order", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box>
        {[
          ["third", "C"],
          ["first", "A"],
          ["second", "B"],
        ].map(([id, value]) => (
          <Static key={id}>
            <Text>{value}</Text>
          </Static>
        ))}
      </Box>
    )),
  );

  expect(staticTranscript(result.frames)).toBe("C\nA\nB\n");
});

test("pending keyed reorder uses host-tree order rather than reverse-flex visual order", async () => {
  const ready = shallowRef(false);
  const entries = shallowRef([
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ]);
  const App = defineComponent(() => () => (
    <Box flexDirection="column-reverse">
      {entries.value.map((entry) => (
        <Static key={entry.id}>
          <Text>{ready.value ? entry.text : ""}</Text>
        </Static>
      ))}
    </Box>
  ));

  const result = await render(App);
  entries.value = [
    { id: "b", text: "B" },
    { id: "c", text: "C" },
    { id: "a", text: "A" },
  ];
  ready.value = true;
  await flush(result);

  expect(staticTranscript(result.frames)).toBe("B\nC\nA\n");
});

test("a later instance inserted before accepted siblings still appends physically", async () => {
  const entries = shallowRef([{ id: 1, text: "A" }]);
  const App = defineComponent(() => () => (
    <Box>
      {entries.value.map((entry) => (
        <Static key={entry.id}>
          <Text>{entry.text}</Text>
        </Static>
      ))}
    </Box>
  ));

  const result = await render(App);
  entries.value = [{ id: 2, text: "B" }, ...entries.value];
  await flush(result);

  expect(staticTranscript(result.frames)).toBe("A\nB\n");
});

test("acceptance releases the committed slot component subtree", async () => {
  const unmounted: string[] = [];
  const Item = defineComponent({
    props: { label: { type: String, required: true } },
    setup(props) {
      onUnmounted(() => unmounted.push(props.label));
      return () => <Text>{props.label}</Text>;
    },
  });
  const App = defineComponent(() => () => (
    <Static>
      <Item label="A" />
    </Static>
  ));

  const result = await render(App);
  await flush(result);

  expect(staticTranscript(result.frames)).toBe("A\n");
  expect(unmounted).toEqual(["A"]);
});

test("accepted Static cleanup errors still allow full session dispose", async () => {
  const cleanupFailure = new Error("accepted Static cleanup failed");
  const captured: unknown[] = [];
  const entries = shallowRef([
    { id: "first", text: "first" },
    { id: "second", text: "second" },
  ]);
  const Item = defineComponent({
    props: {
      id: { type: String, required: true },
      text: { type: String, required: true },
    },
    setup(props) {
      onScopeDispose(() => {
        if (props.id === "second") throw cleanupFailure;
      });
      return () => <Text>{props.text}</Text>;
    },
  });
  const App = defineComponent(() => {
    onErrorCaptured((error) => {
      captured.push(error);
      return false;
    });
    return () => (
      <Box>
        {entries.value.map((entry) => (
          <Static key={entry.id}>
            <Item id={entry.id} text={entry.text} />
          </Static>
        ))}
        <Text>[live]</Text>
      </Box>
    );
  });

  const result = await render(App);
  try {
    expect(captured[0]).toBe(cleanupFailure);
    // After a throwing Vue slot cleanup, further in-session patches are not
    // guaranteed. Runtime-owned dispose must still complete.
  } finally {
    result.dispose();
  }
});
