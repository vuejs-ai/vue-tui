import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render, type RenderResult } from "@vue-tui/testing";
import { Box, Text, type BoxProps } from "@vue-tui/runtime";

function lines(frame: string | undefined): string[] {
  return (frame ?? "").split("\n");
}

function innerBorderRow(frame: string | undefined, row = 1): string {
  return lines(frame)[row]!.slice(1, -1);
}

function characterPosition(
  frame: string | undefined,
  character: string,
): { readonly x: number; readonly y: number } {
  const renderedLines = lines(frame);
  const y = renderedLines.findIndex((line) => line.includes(character));
  expect(y, `frame contains ${JSON.stringify(character)}:\n${frame}`).toBeGreaterThanOrEqual(0);
  return { x: renderedLines[y]!.indexOf(character), y };
}

async function flush(result: Pick<RenderResult, "waitUntilRenderFlush">): Promise<void> {
  await nextTick();
  await result.waitUntilRenderFlush();
}

test("row-reverse and column-reverse reverse source order on their main axes", async () => {
  const row = await render(
    defineComponent(() => () => (
      <Box
        width={8}
        height={3}
        borderStyle="single"
        flexDirection="row-reverse"
        justifyContent="space-between"
      >
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 20 },
  );
  expect(innerBorderRow(row.lastFrame())).toBe("B    A");

  const column = await render(
    defineComponent(() => () => (
      <Box
        width={3}
        height={5}
        borderStyle="single"
        flexDirection="column-reverse"
        justifyContent="space-between"
      >
        <Text>A</Text>
        <Text>B</Text>
      </Box>
    )),
    { columns: 20 },
  );
  const columnLines = lines(column.lastFrame());
  expect(columnLines[1]).toBe("│B│");
  expect(columnLines[3]).toBe("│A│");
});

test("wrap and wrap-reverse place overflowing rows in opposite cross-axis order", async () => {
  const App = (flexWrap: "wrap" | "wrap-reverse") =>
    defineComponent(() => () => (
      <Box width={6} height={2} flexWrap={flexWrap}>
        {(["A", "B", "C"] as const).map((value) => (
          <Box key={value} width={3} flexShrink={0}>
            <Text>{value}</Text>
          </Box>
        ))}
      </Box>
    ));

  const wrapped = await render(App("wrap"), { columns: 20 });
  expect(wrapped.lastFrame({ trimLines: true })).toBe("A  B\nC");

  const reversed = await render(App("wrap-reverse"), { columns: 20 });
  expect(reversed.lastFrame({ trimLines: true })).toBe("C\nA  B");
});

test("alignSelf supports auto, start, center, end, and stretch", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box width={8} height={7} borderStyle="single" flexDirection="column" alignItems="flex-end">
        <Box alignSelf="auto">
          <Text>A</Text>
        </Box>
        <Box alignSelf="flex-start">
          <Text>S</Text>
        </Box>
        <Box alignSelf="center">
          <Text>C</Text>
        </Box>
        <Box alignSelf="flex-end">
          <Text>E</Text>
        </Box>
        <Box alignSelf="stretch" justifyContent="space-between">
          <Text>X</Text>
          <Text>Y</Text>
        </Box>
      </Box>
    )),
    { columns: 20 },
  );

  const content = lines(result.lastFrame())
    .slice(1, -1)
    .map((line) => line.slice(1, -1));
  expect(content).toEqual(["     A", "S     ", "   C  ", "     E", "X    Y"]);
});

test("all justifyContent values distribute the same two children over the inner width", async () => {
  const exactGaps = new Map<BoxProps["justifyContent"], readonly [number, number, number]>([
    ["flex-start", [0, 0, 8]],
    ["center", [4, 0, 4]],
    ["flex-end", [8, 0, 0]],
    ["space-between", [0, 8, 0]],
  ]);

  for (const justifyContent of [
    "flex-start",
    "center",
    "flex-end",
    "space-between",
    "space-around",
    "space-evenly",
  ] as const) {
    const result = await render(
      defineComponent(() => () => (
        <Box width={12} height={3} borderStyle="single" justifyContent={justifyContent}>
          <Text>A</Text>
          <Text>B</Text>
        </Box>
      )),
      { columns: 20 },
    );
    const row = innerBorderRow(result.lastFrame());
    const first = row.indexOf("A");
    const second = row.indexOf("B");
    const actual = [first, second - first - 1, row.length - second - 1] as const;
    const exact = exactGaps.get(justifyContent);
    if (exact) {
      expect(actual, justifyContent).toEqual(exact);
    } else if (justifyContent === "space-around") {
      expect(Math.abs(actual[0] - actual[2]), justifyContent).toBeLessThanOrEqual(1);
      expect(actual[1], justifyContent).toBeGreaterThan(actual[0]);
      expect(actual[1], justifyContent).toBeGreaterThan(actual[2]);
    } else {
      expect(Math.min(...actual), justifyContent).toBeGreaterThan(0);
      expect(Math.max(...actual) - Math.min(...actual), justifyContent).toBeLessThanOrEqual(1);
    }
  }
});

test("rowGap is vertical and columnGap is horizontal in a wrapped row", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box width={5} flexWrap="wrap" rowGap={1} columnGap={1}>
        {(["A", "B", "C"] as const).map((value) => (
          <Box key={value} width={2} flexShrink={0}>
            <Text>{value}</Text>
          </Box>
        ))}
      </Box>
    )),
    { columns: 20 },
  );

  expect(result.lastFrame({ trimLines: true })).toBe("A  B\n\nC");
});

test("withdrawing an axis-specific gap falls back to the broad gap", async () => {
  const horizontalSpecific = shallowRef(true);
  const Horizontal = defineComponent(() => () => (
    <Box gap={1} {...(horizontalSpecific.value ? { columnGap: 3 } : {})}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>
  ));
  const horizontal = await render(Horizontal, { columns: 20 });
  expect(characterPosition(horizontal.lastFrame(), "B").x).toBe(4);
  horizontalSpecific.value = false;
  await flush(horizontal);
  expect(characterPosition(horizontal.lastFrame(), "B").x).toBe(2);

  const verticalSpecific = shallowRef(true);
  const Vertical = defineComponent(() => () => (
    <Box flexDirection="column" gap={1} {...(verticalSpecific.value ? { rowGap: 3 } : {})}>
      <Text>A</Text>
      <Text>B</Text>
    </Box>
  ));
  const vertical = await render(Vertical, { columns: 20 });
  expect(characterPosition(vertical.lastFrame(), "B").y).toBe(4);
  verticalSpecific.value = false;
  await flush(vertical);
  expect(characterPosition(vertical.lastFrame(), "B").y).toBe(2);
});

test("margin edge overrides axis, axis overrides all, and withdrawals reveal fallbacks", async () => {
  const edge = shallowRef(true);
  const axis = shallowRef(true);
  const App = defineComponent(() => () => (
    <Box width={12} height={10} borderStyle="single">
      <Box
        margin={1}
        {...(axis.value ? { marginX: 2, marginY: 2 } : {})}
        {...(edge.value ? { marginLeft: 3, marginTop: 3 } : {})}
      >
        <Text>M</Text>
      </Box>
    </Box>
  ));
  const result = await render(App, { columns: 20 });

  expect(characterPosition(result.lastFrame(), "M")).toEqual({ x: 4, y: 4 });
  edge.value = false;
  await flush(result);
  expect(characterPosition(result.lastFrame(), "M")).toEqual({ x: 3, y: 3 });
  axis.value = false;
  await flush(result);
  expect(characterPosition(result.lastFrame(), "M")).toEqual({ x: 2, y: 2 });
});

test("padding edge overrides axis, axis overrides all, and withdrawals reveal fallbacks", async () => {
  const edge = shallowRef(true);
  const axis = shallowRef(true);
  const App = defineComponent(() => () => (
    <Box width={12} height={10} borderStyle="single">
      <Box
        padding={1}
        {...(axis.value ? { paddingX: 2, paddingY: 2 } : {})}
        {...(edge.value ? { paddingLeft: 3, paddingTop: 3 } : {})}
      >
        <Text>P</Text>
      </Box>
    </Box>
  ));
  const result = await render(App, { columns: 20 });

  expect(characterPosition(result.lastFrame(), "P")).toEqual({ x: 4, y: 4 });
  edge.value = false;
  await flush(result);
  expect(characterPosition(result.lastFrame(), "P")).toEqual({ x: 3, y: 3 });
  axis.value = false;
  await flush(result);
  expect(characterPosition(result.lastFrame(), "P")).toEqual({ x: 2, y: 2 });
});

test("nested percentage width resolves against the containing Box inner width", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box width={20}>
        <Box width={12} height={3} borderStyle="single" paddingX={1}>
          <Box width="100%">
            <Box width="50%" flexShrink={0}>
              <Text>A</Text>
            </Box>
            <Text>B</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 20 },
  );
  const frame = result.lastFrame();
  expect(characterPosition(frame, "B").x - characterPosition(frame, "A").x).toBe(4);
});

test("decimal percentage flexBasis preserves its fractional value", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box width={99}>
        <Box flexBasis="55.9%" flexShrink={0}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 100 },
  );

  expect(characterPosition(result.lastFrame(), "B").x).toBe(55);
});

test("numeric min/max width constrain sibling placement", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box width={10}>
          <Box width={1} minWidth={4} flexShrink={0}>
            <Text>A</Text>
          </Box>
          <Text>B</Text>
        </Box>
        <Box width={10}>
          <Box width={8} maxWidth={3} flexShrink={0}>
            <Text>C</Text>
          </Box>
          <Text>D</Text>
        </Box>
      </Box>
    )),
    { columns: 20 },
  );
  const renderedLines = lines(result.lastFrame());
  expect(renderedLines[0]!.indexOf("B")).toBe(4);
  expect(renderedLines[1]!.indexOf("D")).toBe(3);
});

test("numeric min/max height constrain following rows", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box minHeight={3} flexShrink={0}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
        <Box height={5} maxHeight={2} flexShrink={0}>
          <Text>C</Text>
        </Box>
        <Text>D</Text>
      </Box>
    )),
    { columns: 20 },
  );
  const frame = result.lastFrame();
  expect(characterPosition(frame, "B").y).toBe(3);
  expect(characterPosition(frame, "C").y).toBe(4);
  expect(characterPosition(frame, "D").y).toBe(6);
});

test("relative offsets move paint while preserving the sibling's flow position", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box width={8} height={3} borderStyle="single">
        <Box position="relative" left={2}>
          <Text>A</Text>
        </Box>
        <Text>B</Text>
      </Box>
    )),
    { columns: 20 },
  );

  expect(innerBorderRow(result.lastFrame())).toBe(" BA   ");
});

test("absolute right and bottom anchor against the containing padding box", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box width={8} height={5} borderStyle="single" position="relative">
        <Box position="absolute" right={1} bottom={1}>
          <Text>R</Text>
        </Box>
        <Text>F</Text>
      </Box>
    )),
    { columns: 20 },
  );

  expect(characterPosition(result.lastFrame(), "F")).toEqual({ x: 1, y: 1 });
  expect(characterPosition(result.lastFrame(), "R")).toEqual({ x: 5, y: 2 });
});

test("static stays in flow, ignores offsets, and does not become the containing block", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box width={10} height={5} borderStyle="single" position="relative">
        <Box position="static" left={5} top={3} marginLeft={3}>
          <Text>T</Text>
          <Box position="absolute" left={1} top={1}>
            <Text>S</Text>
          </Box>
        </Box>
        <Text>U</Text>
      </Box>
    )),
    { columns: 20 },
  );
  const frame = result.lastFrame();

  expect(characterPosition(frame, "T")).toEqual({ x: 4, y: 1 });
  expect(characterPosition(frame, "U")).toEqual({ x: 5, y: 1 });
  expect(characterPosition(frame, "S")).toEqual({ x: 2, y: 2 });
});

test("absolute percentage offsets resolve on both axes", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box width={10} height={4} position="relative">
        <Box position="absolute" left="50%" top="50%">
          <Text>P</Text>
        </Box>
      </Box>
    )),
    { columns: 20 },
  );

  expect(characterPosition(result.lastFrame(), "P")).toEqual({ x: 5, y: 2 });
});

test("withdrawing a false border edge restores its glyph and reserved cell", async () => {
  const edgeRemoved = shallowRef(true);
  const App = defineComponent(() => () => (
    <Box
      width={7}
      height={4}
      borderStyle="single"
      {...(edgeRemoved.value ? { borderRight: false } : {})}
    >
      <Text>ABCDEF</Text>
    </Box>
  ));
  const result = await render(App, { columns: 20 });

  const withoutEdge = lines(result.lastFrame());
  expect(withoutEdge[0]).not.toContain("┐");
  expect(withoutEdge.at(-1)).not.toContain("┘");
  expect(withoutEdge.find((line) => line.includes("A"))).toBe("│ABCDEF");
  expect(withoutEdge.filter((line) => /[A-F]/.test(line)).length).toBe(1);

  edgeRemoved.value = false;
  await flush(result);
  const restored = lines(result.lastFrame());
  expect(restored.slice(1, -1).every((line) => line.endsWith("│"))).toBe(true);
  expect(restored.filter((line) => /[A-F]/.test(line)).length).toBe(2);
});

test("axis overflow overrides the broad shorthand", async () => {
  const horizontalVisible = await render(
    defineComponent(() => () => (
      <Box width={10} height={4}>
        <Box width={4} height={2} overflow="hidden" overflowX="visible">
          <Box width={6} height={3} flexShrink={0}>
            <Text>{"ABCDEF\nGHIJKL\nMNOPQR"}</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 10 },
  );
  const horizontalLines = lines(horizontalVisible.lastFrame());
  expect(horizontalLines.slice(0, 2)).toEqual(["ABCDEF", "GHIJKL"]);
  expect(horizontalLines.slice(2).every((line) => line === "")).toBe(true);

  const verticalVisible = await render(
    defineComponent(() => () => (
      <Box width={10} height={4}>
        <Box width={4} height={2} overflow="visible" overflowX="hidden">
          <Box width={6} height={3} flexShrink={0}>
            <Text>{"ABCDEF\nGHIJKL\nMNOPQR"}</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 10 },
  );
  const verticalLines = lines(verticalVisible.lastFrame());
  expect(verticalLines.slice(0, 3)).toEqual(["ABCD", "GHIJ", "MNOP"]);
  expect(verticalLines.slice(3).every((line) => line === "")).toBe(true);
});

test("a visible descendant cannot reopen either axis of an ancestor clip", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box width={10} height={4}>
        <Box width={4} height={2} overflow="hidden">
          <Box width={6} height={3} overflowX="visible" overflowY="visible" flexShrink={0}>
            <Text>{"ABCDEF\nGHIJKL\nMNOPQR"}</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 10 },
  );

  const clippedLines = lines(result.lastFrame());
  expect(clippedLines.slice(0, 2)).toEqual(["ABCD", "GHIJ"]);
  expect(clippedLines.slice(2).every((line) => line === "")).toBe(true);
});
