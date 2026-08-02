import { describe, expect, test } from "vite-plus/test";
import type { RuntimeTableColumn } from "../../src/table/table-props.ts";
import { resolveTableLayout } from "../../src/table/table.ts";

type UntypedColumn = Readonly<{ key: string } & Record<string, unknown>>;

// Runtime validation protects JavaScript and otherwise-untyped callers. Keep
// those malformed values at the pure resolver boundary instead of mounting a
// Vue component solely to make its render function throw.
function resolveUntypedColumns(columns: readonly UntypedColumn[]): void {
  resolveTableLayout([{ value: "x" }], columns as readonly RuntimeTableColumn[], 1);
}

describe("Table validation", () => {
  test.each([
    [
      "primitive header style",
      { key: "value", headerStyle: "bold" },
      "<Table> columns[0].headerStyle must be a plain object.",
    ],
    [
      "primitive cell style",
      { key: "value", cellStyle: "green" },
      "<Table> columns[0].cellStyle must be an object or function.",
    ],
    [
      "primitive cell-style result",
      { key: "value", cellStyle: (): string => "green" },
      '<Table> cellStyle for column "value" must be a plain object.',
    ],
    [
      "cell-level text alignment",
      { key: "value", cellStyle: { textAlign: "right" } },
      '<Table> columns[0].cellStyle contains unsupported field "textAlign".',
    ],
    [
      "cell-level wrapping",
      { key: "value", cellStyle: { wrap: "truncate" } },
      '<Table> columns[0].cellStyle contains unsupported field "wrap".',
    ],
    [
      "unknown cell-style field",
      { key: "value", cellStyle: { unknown: true } },
      '<Table> columns[0].cellStyle contains unsupported field "unknown".',
    ],
    [
      "async cell-style result",
      { key: "value", cellStyle: async (): Promise<{ color: string }> => ({ color: "red" }) },
      '<Table> cellStyle for column "value" must be a plain object.',
    ],
  ] as const)("rejects %s", (_name, column, message) => {
    expect(() => resolveUntypedColumns([column])).toThrow(message);
  });

  test.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid padding %s", (padding) => {
    expect(() => resolveTableLayout([{ value: 1 }], undefined, padding)).toThrow(
      "<Table> padding must be a non-negative safe integer.",
    );
  });

  test("rejects a table wider than Runtime can represent before allocation", () => {
    expect(() => resolveTableLayout([{ value: 1 }], undefined, Number.MAX_SAFE_INTEGER)).toThrow(
      "<Table> rendered width must be no greater than 65535 columns.",
    );
  });

  test.each(["\u001B[31mred\u001B[0m", "A\u001B#8BC", "A\u001BPpayload\u001B\\BC"])(
    "rejects terminal control text %j",
    (value) => {
      expect(() => resolveTableLayout([{ value }], undefined, 1)).toThrow(
        "<Table> text contains a terminal control character.",
      );
    },
  );

  test("requires a formatter for non-scalar cell values", () => {
    expect(() => resolveTableLayout([{ metadata: { id: 7 } }], undefined, 1)).toThrow(
      '<Table> column "metadata" contains a non-scalar value; add format().',
    );
  });
});
