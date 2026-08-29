import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

// Yoga has no CSS automatic minimum size, so Runtime keeps a vertical stack from
// shrinking below its content. A container shorter than its content overflows and
// is clipped instead of compressing every child until some round away.

const columns = 24;
const rows = 20;

const Bounded = defineComponent({
  props: {
    overflow: { type: String, default: undefined },
    flexShrink: { type: Number, default: undefined },
  },
  setup: (props) => () => (
    <Box flexDirection="column">
      <Text>ABOVE</Text>
      <Box
        flexDirection="column"
        height={6}
        overflow={props.overflow as "hidden" | undefined}
        flexShrink={props.flexShrink}
      >
        {Array.from({ length: 30 }, (_, index) => (
          <Text key={index}>{`row ${index + 1}`}</Text>
        ))}
      </Box>
    </Box>
  ),
});

function visible(frame: string): string[] {
  return frame.split("\n").map((line) => line.trimEnd());
}

test("a container shorter than its content keeps the rows it shows contiguous", async () => {
  const result = await render(Bounded, { columns, rows, props: { overflow: "hidden" } });

  try {
    expect(visible(result.lastFrame())).toEqual([
      "ABOVE",
      "row 1",
      "row 2",
      "row 3",
      "row 4",
      "row 5",
      "row 6",
    ]);
  } finally {
    result.dispose();
  }
});

test("content past the container overflows it rather than compressing into it", async () => {
  const result = await render(Bounded, { columns, rows });

  try {
    // Without `overflow: hidden` the extra rows paint outside the container, the
    // same as `overflow: visible` in CSS. What matters either way is that the
    // rows stay consecutive: a compressed stack shows a scattered subset.
    const shown = visible(result.lastFrame()).slice(1);
    const numbers = shown.map((line) => Number(line.replace("row ", "")));
    expect(numbers[0]).toBe(1);
    expect(numbers.every((value, index) => index === 0 || value === numbers[index - 1]! + 1)).toBe(
      true,
    );
  } finally {
    result.dispose();
  }
});

const Shortfall = defineComponent({
  props: { flexShrink: { type: Number, default: undefined } },
  setup: (props) => () => (
    <Box flexDirection="column" height={4}>
      <Box flexDirection="column" height={6} overflow="hidden" flexShrink={props.flexShrink}>
        {Array.from({ length: 30 }, (_, index) => (
          <Text key={index}>{`row ${index + 1}`}</Text>
        ))}
      </Box>
      <Text>FOOTER</Text>
    </Box>
  ),
});

test("a six-row container in a four-row parent overflows instead of giving rows back", async () => {
  const result = await render(Shortfall, { columns, rows });

  try {
    // Nothing shrinks, so the footer sits below the container's full six rows and
    // falls outside the parent.
    expect(visible(result.lastFrame())).toEqual(["row 1", "row 2", "row 3", "row 4"]);
  } finally {
    result.dispose();
  }
});

test("an authored flexShrink is honored, so that container does give rows back", async () => {
  const result = await render(Shortfall, { columns, rows, props: { flexShrink: 1 } });

  try {
    // The guard supplies a default and never overrides a written value.
    expect(visible(result.lastFrame())).toEqual(["row 1", "row 2", "row 3", "FOOTER"]);
  } finally {
    result.dispose();
  }
});

test("the horizontal axis still shrinks so text and columns fit", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box width={10}>
        <Box width={8}>
          <Text>AAAAAAAA</Text>
        </Box>
        <Box width={8}>
          <Text>BBBBBBBB</Text>
        </Box>
      </Box>
    )),
    { columns: 100, rows },
  );

  try {
    const width = Math.max(...visible(result.lastFrame()).map((line) => line.length));
    expect(width).toBeLessThanOrEqual(10);
  } finally {
    result.dispose();
  }
});
