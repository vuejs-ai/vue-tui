import { defineComponent, h, nextTick, onUnmounted, shallowRef, vShow, withDirectives } from "vue";
import { expect, test } from "vite-plus/test";
import { render, type ContentFrame, type RenderResult } from "@vue-tui/testing";
import { Box, Text, renderToString } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { renderToStringWithScreenReader } from "@vue-tui/runtime/internal";

function staticTranscript(frames: readonly ContentFrame[]): string {
  return frames.map((frame) => frame.staticOutput).join("");
}

function count(value: string, marker: string): number {
  return value.split(marker).length - 1;
}

async function flush(result: RenderResult): Promise<void> {
  await nextTick();
  await result.waitUntilRenderFlush();
}

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
  expect(count(transcript, "A")).toBe(1);
  expect(count(transcript, "B")).toBe(1);
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

test("an output-free first commit settles the instance; outer v-if creates a later block", async () => {
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

  ready.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("");

  mounted.value = false;
  await flush(result);
  mounted.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("LATE\n");
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

test("multiple independently mounted Static regions are all honored", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box>
          <Static>
            <Text>HEADER</Text>
          </Static>
        </Box>
        <Box>
          <Static>
            <Text>LOG</Text>
          </Static>
        </Box>
        <Text>[live]</Text>
      </Box>
    )),
  );

  expect(staticTranscript(result.frames)).toBe("HEADER\nLOG\n");
  expect(result.lastFrame()).toBe("[live]");
});

test("layout inside a Static block uses ordinary Box composition", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Static>
        <Box flexDirection="row" paddingLeft={2}>
          <Text>A</Text>
          <Text>B</Text>
        </Box>
      </Static>
    )),
  );

  expect(staticTranscript(result.frames)).toBe("  AB\n");
});

test("an auto-width Static block content-sizes growing children", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Static>
        <Box flexDirection="row">
          <Text>A</Text>
          <Box flexGrow={1} />
          <Text>B</Text>
        </Box>
      </Static>
    )),
    { columns: 80 },
  );

  expect(staticTranscript(result.frames)).toBe("AB\n");
});

test("an explicit-width child can overflow the terminal in Static history", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Static>
        <Box width={10} flexShrink={0}>
          <Text>ABCDEFGHIJ</Text>
        </Box>
      </Static>
    )),
    { columns: 5 },
  );

  expect(staticTranscript(result.frames)).toBe("ABCDEFGHIJ\n");
});

test("plain wide Text in Static history wraps to the terminal width", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Static>
        <Text>ABCDEFGHIJ</Text>
      </Static>
    )),
    { columns: 5 },
  );

  expect(staticTranscript(result.frames)).toBe("ABCDE\nFGHIJ\n");
});

test("removed items and style attributes do not reach the internal host", async () => {
  const legacyAttrs = { items: ["ignored"], style: { paddingLeft: 4 } } as Record<string, unknown>;
  const result = await render(
    defineComponent(() => () => (
      <Static {...legacyAttrs}>
        <Text>X</Text>
      </Static>
    )),
  );

  expect(staticTranscript(result.frames)).toBe("X\n");
});

test("an empty Static block adds no blank line to history or the dynamic frame", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Static />
        <Text>[live]</Text>
      </Box>
    )),
  );

  expect(staticTranscript(result.frames)).toBe("");
  expect(result.lastFrame()).toBe("[live]");
});

test.each(["visual", "screen-reader"] as const)(
  "a Static under an authored hidden ancestor waits until it becomes visible in %s output",
  async (presentation) => {
    const visible = shallowRef(false);
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Box display={visible.value ? "flex" : "none"}>
          <Static>
            <Text>DEFERRED</Text>
          </Static>
        </Box>
        <Text>[live]</Text>
      </Box>
    ));
    const result = await render(App, { host: { presentation } });

    expect(staticTranscript(result.frames)).toBe("");
    expect(result.lastFrame()).toBe("[live]");

    visible.value = true;
    await flush(result);
    expect(staticTranscript(result.frames)).toBe("DEFERRED\n");

    visible.value = false;
    await flush(result);
    visible.value = true;
    await flush(result);
    expect(staticTranscript(result.frames)).toBe("DEFERRED\n");
  },
);

test("a Static under v-show waits for the Box to become visible", async () => {
  const visible = shallowRef(false);
  const App = defineComponent(
    () => () =>
      h(Box, { flexDirection: "column" }, () => [
        withDirectives(
          h(Box, null, () => h(Static, null, () => h(Text, null, () => "VSHOW"))),
          [[vShow, visible.value]],
        ),
        h(Text, null, () => "[live]"),
      ]),
  );
  const result = await render(App);

  expect(staticTranscript(result.frames)).toBe("");
  visible.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("VSHOW\n");
});

test("hidden Static content stays absent from synchronous visual and screen-reader documents", () => {
  const App = defineComponent(() => () => (
    <Box display="none">
      <Static>
        <Text>SECRET</Text>
      </Static>
    </Box>
  ));

  expect(renderToString(App)).toBe("");
  expect(renderToStringWithScreenReader(App)).toBe("");
});

test("nested Static is rejected before live visual or screen-reader output", async () => {
  const App = defineComponent(() => () => (
    <Static>
      <Text>A</Text>
      <Static>
        <Text>B</Text>
      </Static>
      <Text>C</Text>
    </Static>
  ));

  const message = "<Static> cannot be nested inside another <Static>";
  await expect(render(App)).rejects.toThrow(message);
  await expect(render(App, { host: { presentation: "screen-reader" } })).rejects.toThrow(message);
});

test("nested Static is rejected by both synchronous document presentations", () => {
  const App = defineComponent(() => () => (
    <Static>
      <Text>A</Text>
      <Static>
        <Text>B</Text>
      </Static>
      <Text>C</Text>
    </Static>
  ));

  expect(() => renderToString(App)).toThrow("<Static> cannot be nested inside another <Static>");
  expect(() => renderToStringWithScreenReader(App)).toThrow(
    "<Static> cannot be nested inside another <Static>",
  );
});

test("Static in a text context is rejected before Yoga insertion", async () => {
  const App = defineComponent(() => () => (
    <Text>
      before
      <Static>
        <Text>invalid</Text>
      </Static>
    </Text>
  ));
  const message = "<Static> cannot be nested inside <Text> or <Transform> component";

  await expect(render(App)).rejects.toThrow(message);
  expect(() => renderToString(App)).toThrow(message);
});
