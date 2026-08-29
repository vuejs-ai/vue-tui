import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

// Content taller than the surface is clipped, never compressed to fit. Inline shows
// the trailing window so the newest rows stay visible; Fullscreen owns a fixed
// viewport and clips from row zero.

const rows = 6;
const columns = 24;

const Doc = defineComponent({
  props: { count: { type: Number, required: true } },
  setup: (props) => () => (
    <Box flexDirection="column">
      {Array.from({ length: props.count }, (_, index) => (
        <Text key={index}>{`row ${index + 1}`}</Text>
      ))}
    </Box>
  ),
});

function visible(lines: readonly string[]): string[] {
  return lines.map((line) => line.trimEnd()).filter(Boolean);
}

test("Inline shows the trailing window of a taller document", async () => {
  const result = await render(Doc, { columns, rows, props: { count: 10 } });

  try {
    const screen = await result.screen();
    expect(visible(screen.lines)).toEqual(["row 5", "row 6", "row 7", "row 8", "row 9", "row 10"]);
  } finally {
    result.dispose();
  }
});

test("Fullscreen clips a taller document from its first row", async () => {
  const result = await render(Doc, { columns, rows, mode: "fullscreen", props: { count: 10 } });

  try {
    const screen = await result.screen();
    expect(visible(screen.lines)).toEqual(["row 1", "row 2", "row 3", "row 4", "row 5", "row 6"]);
  } finally {
    result.dispose();
  }
});

test.each(["inline", "fullscreen"] as const)(
  "%s keeps the rows it shows contiguous instead of compressing the document",
  async (mode) => {
    const result = await render(Doc, { columns, rows, mode, props: { count: 30 } });

    try {
      const shown = visible((await result.screen()).lines);
      expect(shown).toHaveLength(rows);
      // Every row the surface shows is the next one in the document. A frame that
      // squeezed thirty rows into six would drop rows out of the middle instead.
      const numbers = shown.map((line) => Number(line.replace("row ", "")));
      expect(
        numbers.every((value, index) => index === 0 || value === numbers[index - 1]! + 1),
      ).toBe(true);
    } finally {
      result.dispose();
    }
  },
);

test("a document that fits is shown whole and is not padded", async () => {
  const result = await render(Doc, { columns, rows, props: { count: 3 } });

  try {
    const screen = await result.screen();
    expect(visible(screen.lines)).toEqual(["row 1", "row 2", "row 3"]);
    expect(result.lastFrame()).toBe("row 1\nrow 2\nrow 3");
  } finally {
    result.dispose();
  }
});

test("Inline follows the newest row as the document grows past the terminal", async () => {
  const count = shallowRef(4);
  const Growing = defineComponent(() => () => <Doc count={count.value} />);
  const result = await render(Growing, { columns, rows });

  try {
    expect(visible((await result.screen()).lines)).toEqual(["row 1", "row 2", "row 3", "row 4"]);

    count.value = 12;
    await result.waitUntilRenderFlush();

    expect(visible((await result.screen()).lines)).toEqual([
      "row 7",
      "row 8",
      "row 9",
      "row 10",
      "row 11",
      "row 12",
    ]);
  } finally {
    result.dispose();
  }
});
