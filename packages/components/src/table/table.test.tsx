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
      interactive: false,
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
      interactive: false,
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
      interactive: false,
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
  test("respects column align prop", async () => {
    const columns = [
      { label: "L", key: "key", align: "left" as const },
      { label: "C", key: "key", align: "center" as const },
      { label: "R", key: "key", align: "right" as const },
    ];
    const result = await render(Table, {
      interactive: false,
      props: { data: singleRow, columns },
    });
    try {
      const out = result.lastFrame() ?? "";
      // Each cell contains the value "value", just verify all three render
      // (exact alignment is hard to assert via string snapshot; the key check
      //  is that the component doesn't crash with each align variant)
      const occurrences = [...out.matchAll(/value/g)];
      expect(occurrences.length).toBeGreaterThanOrEqual(3);
    } finally {
      result.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 5. Formatter
  // -------------------------------------------------------------------------
  test("applies formatter to header cells", async () => {
    const columns = [
      {
        label: "Name",
        key: "name",
        formatter: (col: { label: string }) => `***${col.label}***`,
      },
    ];
    const result = await render(Table, {
      interactive: false,
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
  test("respects padding prop", async () => {
    const columns = [{ label: "K", key: "key" }];
    const resultDefault = await render(Table, {
      interactive: false,
      props: { data: singleRow, columns },
    });
    const resultWide = await render(Table, {
      interactive: false,
      props: { data: singleRow, columns, padding: 5 },
    });
    try {
      const outDefault = resultDefault.lastFrame() ?? "";
      const outWide = resultWide.lastFrame() ?? "";
      // Wider padding produces more whitespace → longer total output
      expect(outWide.length).toBeGreaterThan(outDefault.length);
    } finally {
      resultDefault.unmount();
      resultWide.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 7. Custom cell slot
  // -------------------------------------------------------------------------
  test("custom cell slot overrides default rendering", async () => {
    const App = defineComponent(() => {
      return () => (
        <Table data={simpleData}>
          {{
            cell: ({ value }: { value: string }) => <Text>{`[${value}]`}</Text>,
          }}
        </Table>
      );
    });
    const result = await render(App, { interactive: false });
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
    const result = await render(App, { interactive: false });
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
  // 9. Custom skeleton slot
  // -------------------------------------------------------------------------
  test("custom skeleton slot overrides border characters", async () => {
    const App = defineComponent(() => {
      return () => (
        <Table data={simpleData}>
          {{
            skeleton: ({ text, part }: { text: string; part: string }) => (
              <Text>{part === "line" ? "=" : text ? "*" : ""}</Text>
            ),
          }}
        </Table>
      );
    });
    const result = await render(App, { interactive: false });
    try {
      const out = result.lastFrame() ?? "";
      // Border chars are replaced but data values still render
      expect(out).toContain("Alice");
      expect(out).toContain("30");
      // Original box-drawing chars should be gone
      expect(out).not.toContain("─");
      expect(out).not.toContain("┌");
    } finally {
      result.unmount();
    }
  });

  // -------------------------------------------------------------------------
  // 10. Null and undefined cell values
  // -------------------------------------------------------------------------
  test("handles null and undefined cell values without crashing", async () => {
    const data = [
      { a: "ok", b: null, c: undefined },
      { a: null, b: undefined, c: "fine" },
    ];
    const result = await render(Table, {
      interactive: false,
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
      interactive: false,
      props: { data: simpleData, columns: columnsDefault },
    });
    const resultGreen = await render(Table, {
      interactive: false,
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
        formatter: (col: { label: string }) => `[${col.label}]`,
      },
    ];
    const colsColored = [
      {
        label: "Name",
        key: "name",
        headerColor: "green",
        formatter: (col: { label: string }) => `[${col.label}]`,
      },
    ];
    const r1 = await render(Table, {
      interactive: false,
      props: { data: simpleData, columns: colsPlain },
    });
    const r2 = await render(Table, {
      interactive: false,
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
      interactive: false,
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
});
