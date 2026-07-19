import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, renderToString, Text } from "@vue-tui/runtime";
import { renderToStringWithScreenReader } from "@vue-tui/runtime/internal";

const Document = defineComponent(() => () => <Text>document</Text>);

test("rejects every unknown own option before reading columns or rendering", () => {
  let columnsReads = 0;
  let setupRan = false;
  const App = defineComponent(() => {
    setupRan = true;
    return () => <Text>never</Text>;
  });
  const options = Object.defineProperty({ debug: true }, "columns", {
    enumerable: true,
    get() {
      columnsReads++;
      throw new Error("columns getter must not run");
    },
  });

  expect(() => renderToString(App, options as never)).toThrow(
    'renderToString received an unknown option "debug"',
  );
  expect(columnsReads).toBe(0);
  expect(setupRan).toBe(false);
});

test("rejects symbol options instead of silently ignoring them", () => {
  const option = Symbol("presentation");
  expect(() => renderToString(Document, { [option]: true } as never)).toThrow(
    "renderToString received an unknown symbol option",
  );
});

test.each([null, [], "80", 80, true])("rejects non-option-object input %#", (options) => {
  expect(() => renderToString(Document, options as never)).toThrow(TypeError);
});

test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 65_536, "80"])(
  "rejects invalid columns %#",
  (columns) => {
    expect(() => renderToString(Document, { columns } as never)).toThrow(
      'renderToString option "columns" must be an integer between 1 and 65535',
    );
  },
);

test("accepts the largest terminal-sized string-render width", () => {
  expect(renderToString(Document, { columns: 65_535 })).toBe("document");
});

test("rejects an oversized final document before allocating its paint grid", () => {
  const OversizedDocument = defineComponent(() => () => (
    <Box width={1_024} height={1_025} flexShrink={0}>
      <Text>document</Text>
    </Box>
  ));

  expect(() => renderToString(OversizedDocument, { columns: 1_024 })).toThrow(
    new RangeError("Paint surface 1024x1025 exceeds the 1048576-cell resource limit."),
  );
});

test("reads an accepted columns accessor exactly once", () => {
  let reads = 0;
  const options = Object.defineProperty({}, "columns", {
    enumerable: true,
    get() {
      reads++;
      return 20;
    },
  });

  expect(renderToString(Document, options)).toBe("document");
  expect(reads).toBe(1);
});

test("the internal transcript helper uses the same closed option bag", () => {
  expect(() => renderToStringWithScreenReader(Document, { unknown: true } as never)).toThrow(
    'renderToStringWithScreenReader received an unknown option "unknown"',
  );
});
