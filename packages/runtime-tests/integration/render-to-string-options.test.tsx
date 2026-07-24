import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, renderToString, Text } from "@vue-tui/runtime";

const Document = defineComponent(() => () => <Text>document</Text>);

test("ignores unrelated string and symbol options without reading them", () => {
  let widthReads = 0;
  let ignoredReads = 0;
  const presentation = Symbol("presentation");
  const options = Object.defineProperties(
    {
      mode: "fullscreen",
      rows: 24,
      columns: 99,
      fullscreen: true,
      alternateScreen: true,
      isScreenReaderEnabled: true,
    },
    {
      width: {
        enumerable: true,
        get() {
          widthReads++;
          return 20;
        },
      },
      debug: {
        enumerable: true,
        get() {
          ignoredReads++;
          throw new Error("debug getter must not run");
        },
      },
      [presentation]: {
        enumerable: true,
        get() {
          ignoredReads++;
          throw new Error("symbol getter must not run");
        },
      },
    },
  );

  expect(renderToString(Document, options as never)).toBe("document");
  expect(widthReads).toBe(1);
  expect(ignoredReads).toBe(0);
});

test.each([null, [], "80", 80, true])("rejects non-option-object input %#", (options) => {
  expect(() => renderToString(Document, options as never)).toThrow(TypeError);
});

test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 65_536, "80"])(
  "rejects invalid width %#",
  (width) => {
    expect(() => renderToString(Document, { width } as never)).toThrow(
      'renderToString option "width" must be an integer between 1 and 65535',
    );
  },
);

test.each([0, -1, 1.5, Number.NaN, Number.NEGATIVE_INFINITY, 65_536, "24"])(
  "rejects invalid height %#",
  (height) => {
    expect(() => renderToString(Document, { height } as never)).toThrow(
      'renderToString option "height" must be a positive integer at most 65535, or Infinity',
    );
  },
);

test("accepts the largest terminal-sized string-render width", () => {
  expect(renderToString(Document, { width: 65_535 })).toBe("document");
});

test("accepts explicit unbounded height", () => {
  expect(renderToString(Document, { height: Infinity })).toBe("document");
});

test("rejects an oversized final document before allocating its paint grid", () => {
  const OversizedDocument = defineComponent(() => () => (
    <Box width={1_024} height={1_025} flexShrink={0}>
      <Text>document</Text>
    </Box>
  ));

  expect(() => renderToString(OversizedDocument, { width: 1_024, height: Infinity })).toThrow(
    new RangeError("Paint surface 1024x1025 exceeds the 1048576-cell resource limit."),
  );
});

test("reads an accepted width accessor exactly once", () => {
  let reads = 0;
  const options = Object.defineProperty({}, "width", {
    enumerable: true,
    get() {
      reads++;
      return 20;
    },
  });

  expect(renderToString(Document, options)).toBe("document");
  expect(reads).toBe(1);
});
