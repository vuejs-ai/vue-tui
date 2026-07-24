import {
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onErrorCaptured,
  onScopeDispose,
  onUnmounted,
  shallowRef,
  vShow,
  watchEffect,
  withDirectives,
} from "vue";
import { expect, test } from "vite-plus/test";
import { render, type ContentFrame, type RenderResult } from "@vue-tui/testing";
import { Box, Text, renderToString } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";

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

test("an output-free Static stays open until its first later non-empty output", async () => {
  const ready = shallowRef(false);
  const value = shallowRef("first");
  const unmounted: string[] = [];
  const Deferred = defineComponent(() => {
    onUnmounted(() => unmounted.push("deferred"));
    return () => <Text>{ready.value ? value.value : ""}</Text>;
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

test("one accepted batch releases every slot scope before forwarding its first cleanup error", async () => {
  const events: string[] = [];
  const captured: unknown[] = [];
  const firstFailure = new Error("first Static cleanup failed");
  const live = shallowRef("live");

  const Leaf = defineComponent({
    props: { label: { type: String, required: true } },
    setup(props) {
      onScopeDispose(() => events.push(`${props.label}-leaf`));
      return () => <Text>{props.label}</Text>;
    },
  });
  const First = defineComponent(() => {
    onScopeDispose(() => {
      events.push("first-parent");
      throw firstFailure;
    });
    return () => (
      <Box>
        <Leaf label="first" />
      </Box>
    );
  });
  const Second = defineComponent(() => {
    onScopeDispose(() => events.push("second-parent"));
    return () => (
      <Box>
        <Leaf label="second" />
      </Box>
    );
  });
  const App = defineComponent(() => {
    onErrorCaptured((error) => {
      captured.push(error);
      return false;
    });
    return () => (
      <Box flexDirection="column">
        <Static>
          <First />
        </Static>
        <Static>
          <Second />
        </Static>
        <Text>{live.value}</Text>
      </Box>
    );
  });

  const result = await render(App);
  try {
    await flush(result);
    expect(staticTranscript(result.frames)).toBe("first\nsecond\n");
    expect(events).toEqual(["first-parent", "first-leaf", "second-parent", "second-leaf"]);
    expect(captured).toEqual([firstFailure]);
    expect(result.lastFrame()).toBe("live");

    live.value = "still-live";
    await flush(result);
    expect(result.lastFrame()).toBe("still-live");
  } finally {
    result.dispose();
  }
});

test("a handled accepted-scope cleanup error leaves keyed Static anchors patchable", async () => {
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
    expect(captured).toEqual([cleanupFailure]);

    entries.value = [...entries.value].reverse();
    await flush(result);
    expect(captured).toEqual([cleanupFailure]);

    entries.value = [];
    await flush(result);
    expect(captured).toEqual([cleanupFailure]);
    expect(result.lastFrame()).toBe("[live]");
  } finally {
    result.dispose();
  }
});

test("Vue-handled watcher and lifecycle cleanup errors keep their native hook timing", async () => {
  const events: string[] = [];
  const watchFailure = new Error("watch cleanup failed");
  const lifecycleFailure = new Error("before-unmount failed");

  const Item = defineComponent({
    props: { label: { type: String, required: true } },
    setup(props) {
      watchEffect((onCleanup) => {
        onCleanup(() => {
          events.push(`${props.label}-watch`);
          if (props.label === "first") throw watchFailure;
        });
      });
      onBeforeUnmount(() => {
        events.push(`${props.label}-before`);
        if (props.label === "first") throw lifecycleFailure;
      });
      onScopeDispose(() => events.push(`${props.label}-scope`));
      return () => <Text>{props.label}</Text>;
    },
  });
  const App = defineComponent(() => {
    onErrorCaptured((error) => {
      events.push(error === watchFailure ? "captured-watch" : "captured-before");
      return false;
    });
    return () => (
      <Box>
        <Static>
          <Item label="first" />
        </Static>
        <Static>
          <Item label="second" />
        </Static>
      </Box>
    );
  });

  const result = await render(App);
  try {
    expect(events).toEqual([
      "first-before",
      "captured-before",
      "first-watch",
      "captured-watch",
      "first-scope",
      "second-before",
      "second-watch",
      "second-scope",
    ]);
  } finally {
    result.dispose();
  }
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

test("component and Fragment wrappers are valid while ancestor Box layout stays outside the block", async () => {
  const ThroughFragment = defineComponent(() => () => (
    <>
      <Static>
        <Box flexDirection="row">
          <Text>A</Text>
          <Text>B</Text>
        </Box>
      </Static>
    </>
  ));
  const result = await render(
    defineComponent(() => () => (
      <Box flexDirection="column-reverse" width={1} paddingLeft={4} overflow="hidden">
        <ThroughFragment />
        <Text>[live]</Text>
      </Box>
    )),
  );

  expect(staticTranscript(result.frames)).toBe("AB\n");
  expect(result.lastFrame()).toBe("");
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

test("v-show does not change mounted Static eligibility", async () => {
  const visible = shallowRef(false);
  const App = defineComponent(
    () => () =>
      h(Box, { flexDirection: "column" }, () => [
        withDirectives(
          h(Box, null, () => h(Static, null, () => h(Text, null, () => "ANCESTOR"))),
          [[vShow, visible.value]],
        ),
        withDirectives(
          h(Static, null, () => h(Text, null, () => "DIRECT")),
          [[vShow, visible.value]],
        ),
        h(Text, null, () => "[live]"),
      ]),
  );
  const result = await render(App);

  expect(staticTranscript(result.frames)).toBe("ANCESTOR\nDIRECT\n");
  visible.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("ANCESTOR\nDIRECT\n");
});

test("nested v-show ancestors neither defer nor rewrite mounted Static", async () => {
  const outerVisible = shallowRef(false);
  const innerVisible = shallowRef(false);
  const entries = shallowRef([
    { id: "a", text: "old-A" },
    { id: "b", text: "old-B" },
  ]);
  const App = defineComponent(
    () => () =>
      h(Box, null, () => [
        withDirectives(
          h(Box, null, () =>
            withDirectives(
              h(Box, null, () =>
                entries.value.map((entry) =>
                  h(Static, { key: entry.id }, () => h(Text, null, () => entry.text)),
                ),
              ),
              [[vShow, innerVisible.value]],
            ),
          ),
          [[vShow, outerVisible.value]],
        ),
        h(Text, null, () => "[live]"),
      ]),
  );
  const result = await render(App);
  expect(staticTranscript(result.frames)).toBe("old-A\nold-B\n");

  entries.value = [
    { id: "b", text: "new-B" },
    { id: "a", text: "new-A" },
  ];
  outerVisible.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("old-A\nold-B\n");

  innerVisible.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("old-A\nold-B\n");
});

test("v-show does not hide Static from a synchronous document", () => {
  const App = defineComponent(
    () => () =>
      h(Box, null, () => [
        withDirectives(
          h(Box, null, () => h(Static, null, () => h(Text, null, () => "ANCESTOR"))),
          [[vShow, false]],
        ),
        withDirectives(
          h(Static, null, () => h(Text, null, () => "DIRECT")),
          [[vShow, false]],
        ),
      ]),
  );

  expect(renderToString(App)).toBe("ANCESTOR\nDIRECT");
});

test("nested Static is rejected before live output", async () => {
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
});

test("nested Static is rejected by the synchronous document renderer", () => {
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
});

test("deep Static nesting through components and Box is rejected", async () => {
  const Inner = defineComponent(() => () => (
    <Box>
      <Static>
        <Text>inner</Text>
      </Static>
    </Box>
  ));
  const App = defineComponent(() => () => (
    <Static>
      <Box>
        <Inner />
      </Box>
    </Static>
  ));

  await expect(render(App)).rejects.toThrow("<Static> cannot be nested inside another <Static>");
});

test("a handled later invalid insertion emits no history and an open block can recover", async () => {
  const invalid = shallowRef(false);
  const ready = shallowRef(false);
  const captured: unknown[] = [];
  const Pending = defineComponent(() => () => (
    <Static>
      <Box>
        <Text>{ready.value ? "RECOVERED" : ""}</Text>
        {invalid.value ? (
          <Static>
            <Text>INVALID</Text>
          </Static>
        ) : null}
      </Box>
    </Static>
  ));
  const App = defineComponent(() => {
    onErrorCaptured((error) => {
      captured.push(error);
      return false;
    });
    return () => <Pending />;
  });
  const result = await render(App);

  invalid.value = true;
  await flush(result);
  expect(captured).toHaveLength(1);
  expect(captured[0]).toMatchObject({
    message: "<Static> cannot be nested inside another <Static>",
  });
  expect(staticTranscript(result.frames)).toBe("");

  invalid.value = false;
  ready.value = true;
  await flush(result);
  expect(staticTranscript(result.frames)).toBe("RECOVERED\n");
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
