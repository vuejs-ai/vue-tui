import { defineComponent } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text } from "@vue-tui/runtime";
import Table from "./table.vue";

// =============================================================================
// Test data helpers
// =============================================================================

const simpleData = [
  { name: "Alice", age: 30 },
  { name: "Bob", age: 25 },
];

const singleRow = [{ key: "value" }];

// =============================================================================
// Tests
// =============================================================================

describe("Table", () => {
  // -------------------------------------------------------------------------
  // 1. Basic rendering with auto-derived columns
  // -------------------------------------------------------------------------
  test("renders a basic table with auto-derived columns from data", async () => {
    const result = await render(Table, {
      props: { data: simpleData },
    });
    try {
      const out = result.lastFrame() ?? "";

      // Unicode box-drawing characters
      expect(out).toContain("┌");
      expect(out).toContain("┐");
      expect(out).toContain("└");
      expect(out).toContain("┘");
      expect(out).toContain("├");
      expect(out).toContain("┤");
      expect(out).toContain("│");

      // Data values
      expect(out).toContain("Alice");
      expect(out).toContain("30");
      expect(out).toContain("Bob");
      expect(out).toContain("25");
    } finally {
      result.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 2. Explicit column config
  // -------------------------------------------------------------------------
  test("renders with explicit column config and custom labels", async () => {
    const columns = [
      { label: "Name", key: "name" },
      { label: "Age", key: "age" },
    ];
    const result = await render(Table, {
      props: { data: simpleData, columns },
    });
    try {
      const out = result.lastFrame() ?? "";
      expect(out).toContain("Name");
      expect(out).toContain("Age");
      expect(out).toContain("Alice");
      expect(out).toContain("30");
    } finally {
      result.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 3. Empty data array
  // -------------------------------------------------------------------------
  test("renders empty data array without error", async () => {
    const result = await render(Table, {
      props: { data: [] },
    });
    try {
      const out = result.lastFrame() ?? "";
      // Should still render top and bottom borders (header + empty content)
      expect(out).toContain("┌");
      expect(out).toContain("└");
    } finally {
      result.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 4. Column alignment
  // -------------------------------------------------------------------------
  test("left alignment places content at padding offset from left border", async () => {
    // Label "HHHH" (4 chars), value "AB" (2 chars), padding=1
    // column width = max(4, 2) + 2 = 6
    // left-aligned cell: pad=1 space + "AB" + fill=3 spaces = " AB   "
    const data = [{ a: "AB" }];
    const columns = [{ label: "HHHH", key: "a", align: "left" as const }];
    const result = await render(Table, { props: { data, columns } });
    try {
      const out = result.lastFrame() ?? "";
      // Data row has no ANSI inside cell content; only borders are bold-wrapped.
      // Strip ANSI and assert the exact spacing pattern.
      const clean = out.replace(/\x1b\[[\d;]*m/g, "");
      expect(clean).toContain("│ AB   │");
    } finally {
      result.unmount();
    }
  });

  test("center alignment distributes space evenly around content", async () => {
    // Same setup: width=6, centered: (6-2)/2 = 2 spaces each side → "  AB  "
    const data = [{ a: "AB" }];
    const columns = [{ label: "HHHH", key: "a", align: "center" as const }];
    const result = await render(Table, { props: { data, columns } });
    try {
      const out = result.lastFrame() ?? "";
      const clean = out.replace(/\x1b\[[\d;]*m/g, "");
      expect(clean).toContain("│  AB  │");
    } finally {
      result.unmount();
    }
  });

  test("right alignment places content at padding offset from right border", async () => {
    // Same setup: width=6, right-aligned: fill=3 spaces + "AB" + pad=1 → "   AB "
    const data = [{ a: "AB" }];
    const columns = [{ label: "HHHH", key: "a", align: "right" as const }];
    const result = await render(Table, { props: { data, columns } });
    try {
      const out = result.lastFrame() ?? "";
      const clean = out.replace(/\x1b\[[\d;]*m/g, "");
      expect(clean).toContain("│   AB │");
    } finally {
      result.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 5. Header formatter
  // -------------------------------------------------------------------------
  test("applies headerFormatter to header cells", async () => {
    const columns = [
      {
        label: "Name",
        key: "name",
        headerFormatter: (col: { label: string }) => `***${col.label}***`,
      },
    ];
    const result = await render(Table, {
      props: { data: simpleData, columns },
    });
    try {
      const out = result.lastFrame() ?? "";
      // Formatter applied to header text
      expect(out).toContain("***Name***");
    } finally {
      result.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 6. Custom padding
  // -------------------------------------------------------------------------
  test("padding=0 renders cells with no space between border and content", async () => {
    // Label "K" (1), value "value" (5), padding=0
    // width = max(1, 5) + 0 = 5, cell = "value"
    const columns = [{ label: "K", key: "key" }];
    const result = await render(Table, {
      props: { data: singleRow, columns, padding: 0 },
    });
    try {
      const out = result.lastFrame() ?? "";
      const clean = out.replace(/\x1b\[[\d;]*m/g, "");
      expect(clean).toContain("│value│");
    } finally {
      result.unmount();
    }
  });

  test("padding=2 adds two spaces on each side of cell content", async () => {
    // Label "K" (1), value "value" (5), padding=2
    // width = max(1, 5) + 4 = 9, cell (left-aligned) = "  value  "
    const columns = [{ label: "K", key: "key" }];
    const result = await render(Table, {
      props: { data: singleRow, columns, padding: 2 },
    });
    try {
      const out = result.lastFrame() ?? "";
      const clean = out.replace(/\x1b\[[\d;]*m/g, "");
      expect(clean).toContain("│  value  │");
    } finally {
      result.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 7. Custom default slot (was "cell")
  // -------------------------------------------------------------------------
  test("custom default slot overrides cell rendering", async () => {
    const App = defineComponent(() => {
      return () => (
        <Table data={simpleData}>
          {{
            default: ({ value }: { value: string }) => <Text>{`[${value}]`}</Text>,
          }}
        </Table>
      );
    });
    const result = await render(App);
    try {
      const out = result.lastFrame() ?? "";
      // Default rendering is plain text; custom slot wraps in brackets
      expect(out).toContain("[Alice]");
      expect(out).toContain("[30]");
      expect(out).toContain("[Bob]");
      expect(out).toContain("[25]");
    } finally {
      result.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 8. Custom header slot
  // -------------------------------------------------------------------------
  test("custom header slot overrides default rendering", async () => {
    const App = defineComponent(() => {
      return () => (
        <Table data={simpleData}>
          {{
            header: ({ column }: { column: { label: string } }) => (
              <Text>{`[${column.label}]`}</Text>
            ),
          }}
        </Table>
      );
    });
    const result = await render(App);
    try {
      const out = result.lastFrame() ?? "";
      // Default header renders bold blue; custom slot wraps in brackets
      expect(out).toContain("[name]");
      expect(out).toContain("[age]");
    } finally {
      result.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 9. Null and undefined cell values
  // -------------------------------------------------------------------------
  test("handles null and undefined cell values without crashing", async () => {
    const data = [
      { a: "ok", b: null, c: undefined },
      { a: null, b: undefined, c: "fine" },
    ];
    const result = await render(Table, {
      props: { data },
    });
    try {
      const out = result.lastFrame() ?? "";
      // Existing values still render
      expect(out).toContain("ok");
      expect(out).toContain("fine");
      // null and undefined are NOT rendered as the string "null" or "undefined"
      expect(out).not.toContain("null");
      expect(out).not.toContain("undefined");
      // Borders are present (table rendered successfully)
      expect(out).toContain("│");
    } finally {
      result.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 11. headerColor on columns
  // -------------------------------------------------------------------------
  test("headerColor overrides the default blue header color", async () => {
    const columnsDefault = [{ label: "Name", key: "name" }];
    const columnsGreen = [{ label: "Name", key: "name", headerColor: "green" }];
    const resultDefault = await render(Table, {
      props: { data: simpleData, columns: columnsDefault },
    });
    const resultGreen = await render(Table, {
      props: { data: simpleData, columns: columnsGreen },
    });
    try {
      const outDefault = resultDefault.lastFrame() ?? "";
      const outGreen = resultGreen.lastFrame() ?? "";
      // Both render the header text
      expect(outDefault).toContain("Name");
      expect(outGreen).toContain("Name");
      // Output differs because the color changed (blue → green)
      expect(outDefault).not.toBe(outGreen);
    } finally {
      resultDefault.unmount();
      resultGreen.unmount();
    }
  });

  test("headerColor applies to formatted headers", async () => {
    const colsPlain = [
      {
        label: "Name",
        key: "name",
        headerFormatter: (col: { label: string }) => `[${col.label}]`,
      },
    ];
    const colsColored = [
      {
        label: "Name",
        key: "name",
        headerColor: "green",
        headerFormatter: (col: { label: string }) => `[${col.label}]`,
      },
    ];
    const r1 = await render(Table, {
      props: { data: simpleData, columns: colsPlain },
    });
    const r2 = await render(Table, {
      props: { data: simpleData, columns: colsColored },
    });
    try {
      const out1 = r1.lastFrame() ?? "";
      const out2 = r2.lastFrame() ?? "";
      expect(out1).toContain("[Name]");
      expect(out2).toContain("[Name]");
      // With headerColor the output should differ (color applied)
      expect(out1).not.toBe(out2);
    } finally {
      r1.unmount();
      r2.unmount();
    }
  });

  test("headerColor renders without error on mixed columns", async () => {
    const columns = [
      { label: "Name", key: "name", headerColor: "red" },
      { label: "Age", key: "age" },
      { label: "City", key: "city", headerColor: "green" },
    ];
    const data = [{ name: "Alice", age: 30, city: "NYC" }];
    const result = await render(Table, {
      props: { data, columns },
    });
    try {
      const out = result.lastFrame() ?? "";
      expect(out).toContain("Name");
      expect(out).toContain("Age");
      expect(out).toContain("City");
      expect(out).toContain("Alice");
      expect(out).toContain("30");
      expect(out).toContain("NYC");
      // ANSI codes are present (FORCE_COLOR=3 in vitest config)
      expect(out).toContain("\x1b[");
    } finally {
      result.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 12. Padding validation
  // -------------------------------------------------------------------------
  test("throws for negative padding", async () => {
    await expect(
      render(Table, {
        props: { data: simpleData, padding: -1 },
      }),
    ).rejects.toThrow("[Table] padding must be a non-negative integer");
  });

  test("throws for fractional padding", async () => {
    await expect(
      render(Table, {
        props: { data: simpleData, padding: 1.5 },
      }),
    ).rejects.toThrow("[Table] padding must be a non-negative integer");
  });

  test("accepts zero padding", async () => {
    const result = await render(Table, {
      props: { data: simpleData, padding: 0 },
    });
    try {
      const out = result.lastFrame() ?? "";
      expect(out).toContain("Alice");
    } finally {
      result.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 13. Multi-line text normalization
  // -------------------------------------------------------------------------
  test("strips newlines from cell values to preserve single-line rows", async () => {
    const data = [{ a: "line1\nline2" }];
    const result = await render(Table, {
      props: { data },
    });
    try {
      const out = result.lastFrame() ?? "";
      // The raw value "line1\nline2" is normalized to "line1line2"
      expect(out).toContain("line1line2");
      // The original newline should not split the value across multiple lines;
      // "line1" and "line2" must appear together on the same line.
      const lines = out.split("\n");
      const dataLine = lines.find((l) => l.includes("line1"));
      expect(dataLine).toBeDefined();
      expect(dataLine).toContain("line1line2");
    } finally {
      result.unmount();
    }
  });
});
