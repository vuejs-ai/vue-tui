import {
  defineComponent,
  isReadonly,
  nextTick,
  shallowRef,
  type ComponentPublicInstance,
} from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import {
  Box,
  Text,
  useElementGeometry,
  type ElementGeometry,
  type UseElementGeometryReturn,
} from "@vue-tui/runtime";

function resolved(geometry: ElementGeometry) {
  if (
    geometry.status === "unavailable" ||
    geometry.status === "detached" ||
    geometry.status === "pending" ||
    geometry.status === "hidden"
  ) {
    throw new Error(`expected resolved geometry, received ${geometry.status}`);
  }
  return geometry;
}

test.each(["inline", "fullscreen"] as const)(
  "publishes the same exact frozen Box mapping in %s mode",
  async (mode) => {
    let projection!: UseElementGeometryReturn;
    const App = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      projection = useElementGeometry(target);
      return () => (
        <Box marginLeft={2} width={8} height={3}>
          <Box ref={target} marginLeft={1} width={4} height={2}>
            <Text>box</Text>
          </Box>
        </Box>
      );
    });

    const result = await render(App, {
      columns: 20,
      rows: 6,
      host: { mode },
    });
    try {
      const geometry = resolved(projection.geometry.value);
      expect(geometry).toEqual({
        status: "visible",
        parent: { x: 1, y: 0, width: 4, height: 2 },
        surface: { x: 3, y: 0, width: 4, height: 2 },
        fragments: [
          {
            local: { x: 0, y: 0, width: 4, height: 2 },
            parent: { x: 1, y: 0, width: 4, height: 2 },
            surface: { x: 3, y: 0, width: 4, height: 2 },
            visibleSurface: { x: 3, y: 0, width: 4, height: 2 },
          },
        ],
      });
      expect(Reflect.ownKeys(geometry)).toEqual(["status", "parent", "surface", "fragments"]);
      expect(Object.isFrozen(projection)).toBe(true);
      expect(isReadonly(projection.geometry)).toBe(true);
      expect(Object.isFrozen(geometry)).toBe(true);
      expect(Object.isFrozen(geometry.fragments)).toBe(true);
      expect(Object.isFrozen(geometry.fragments[0])).toBe(true);
      expect(Object.isFrozen(geometry.fragments[0]!.surface)).toBe(true);
    } finally {
      result.dispose();
    }
  },
);

test("does not mistake a Vue component string type prop for a renderer node", async () => {
  let projection!: UseElementGeometryReturn;
  const TargetWithTypeProp = defineComponent({
    props: {
      type: { type: String, default: "probe" },
    },
    setup: () => () => (
      <Box width={4} height={1}>
        <Text>node</Text>
      </Box>
    ),
  });
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    projection = useElementGeometry(target);
    return () => <TargetWithTypeProp ref={target} />;
  });

  const result = await render(App, { columns: 10, rows: 3 });
  try {
    expect(resolved(projection.geometry.value).surface).toEqual({
      x: 0,
      y: 0,
      width: 4,
      height: 1,
    });
  } finally {
    result.dispose();
  }
});

test("updates public geometry after layout changes without rerendering the target", async () => {
  const sibling = shallowRef("one");
  let targetRenders = 0;
  let projection!: UseElementGeometryReturn;
  const StableTarget = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    projection = useElementGeometry(target);
    return () => {
      targetRenders++;
      return (
        <Box ref={target} width="100%" height={2}>
          <Text>target</Text>
        </Box>
      );
    };
  });
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Text>{sibling.value}</Text>
      <StableTarget />
    </Box>
  ));

  const result = await render(App, { columns: 100, rows: 10 });
  try {
    expect(resolved(projection.geometry.value).surface).toEqual({
      x: 0,
      y: 1,
      width: 100,
      height: 2,
    });
    expect(targetRenders).toBe(1);

    sibling.value = "one\ntwo\nthree";
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(resolved(projection.geometry.value).surface).toEqual({
      x: 0,
      y: 3,
      width: 100,
      height: 2,
    });
    expect(targetRenders).toBe(1);

    await result.terminal.resize(60, 10);
    expect(resolved(projection.geometry.value).surface).toEqual({
      x: 0,
      y: 3,
      width: 60,
      height: 2,
    });
    expect(targetRenders).toBe(1);
  } finally {
    result.dispose();
  }
});

test("follows hidden, visible, and detached rendered-target lifetime", async () => {
  const visible = shallowRef(true);
  const hidden = shallowRef(true);
  let projection!: UseElementGeometryReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    projection = useElementGeometry(target);
    return () =>
      visible.value ? (
        <Box ref={target} display={hidden.value ? "none" : "flex"} width={5} height={1}>
          <Text>alive</Text>
        </Box>
      ) : null;
  });

  const result = await render(App, { columns: 20, rows: 4 });
  try {
    expect(projection.geometry.value).toEqual({ status: "hidden" });

    hidden.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(resolved(projection.geometry.value).surface).toEqual({
      x: 0,
      y: 0,
      width: 5,
      height: 1,
    });

    visible.value = false;
    await nextTick();
    expect(projection.geometry.value).toEqual({ status: "detached" });
  } finally {
    result.dispose();
  }
});

test("maps a wrapped nested Text without exposing private insertion slots", async () => {
  let projection!: UseElementGeometryReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    projection = useElementGeometry(target);
    return () => (
      <Box width={5}>
        <Text>
          ab<Text ref={target}>C中DE</Text>
        </Text>
      </Box>
    );
  });

  const result = await render(App, { columns: 5, rows: 4 });
  try {
    const geometry = resolved(projection.geometry.value);
    expect(geometry.fragments).toEqual([
      {
        local: { x: 0, y: 0, width: 3, height: 1 },
        parent: { x: 2, y: 0, width: 3, height: 1 },
        surface: { x: 2, y: 0, width: 3, height: 1 },
        visibleSurface: { x: 2, y: 0, width: 3, height: 1 },
      },
      {
        local: { x: 0, y: 1, width: 2, height: 1 },
        parent: { x: 0, y: 1, width: 2, height: 1 },
        surface: { x: 0, y: 1, width: 2, height: 1 },
        visibleSurface: { x: 0, y: 1, width: 2, height: 1 },
      },
    ]);
    expect(geometry).not.toHaveProperty("caretSlots");
  } finally {
    result.dispose();
  }
});

test("distinguishes partial visibility from a fully clipped element", async () => {
  const offset = shallowRef(3);
  let projection!: UseElementGeometryReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    projection = useElementGeometry(target);
    return () => (
      <Box width={4} height={1} overflowX="hidden">
        <Box ref={target} marginLeft={offset.value} width={3} height={1} flexShrink={0}>
          <Text>abc</Text>
        </Box>
      </Box>
    );
  });

  const result = await render(App, { columns: 10, rows: 3 });
  try {
    const partiallyVisible = resolved(projection.geometry.value);
    expect(partiallyVisible.status).toBe("visible");
    expect(partiallyVisible.fragments[0]!.visibleSurface).toEqual({
      x: 3,
      y: 0,
      width: 1,
      height: 1,
    });

    offset.value = 4;
    await nextTick();
    await result.waitUntilRenderFlush();
    const fullyClipped = resolved(projection.geometry.value);
    expect(fullyClipped.status).toBe("fully-clipped");
    expect(fullyClipped.fragments[0]!.visibleSurface).toBeNull();
  } finally {
    result.dispose();
  }
});

test("reports presentation unavailability before target attachment in screen-reader output", async () => {
  let projection!: UseElementGeometryReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    projection = useElementGeometry(target);
    return () => <Text>linear transcript</Text>;
  });

  const result = await render(App, {
    columns: 20,
    rows: 4,
    host: { presentation: "screen-reader" },
  });
  try {
    expect(projection.geometry.value).toEqual({ status: "unavailable" });
  } finally {
    result.dispose();
  }
});

test("a retained public projection detaches when its setup scope is disposed", async () => {
  let projection!: UseElementGeometryReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    projection = useElementGeometry(target);
    return () => (
      <Box ref={target} width={3} height={1}>
        <Text>bye</Text>
      </Box>
    );
  });

  const result = await render(App, { columns: 10, rows: 3 });
  expect(projection.geometry.value.status).toBe("visible");
  result.dispose();
  expect(projection.geometry.value).toEqual({ status: "detached" });
});
