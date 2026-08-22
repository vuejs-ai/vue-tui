import { defineComponent, nextTick, shallowRef } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Box, Text } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";
import { Chalk } from "chalk";
import { Table, type TableColumn } from "../../src/index.ts";

const chalk = new Chalk({ level: 3 });

async function renderTable<Row extends object>(
  data: readonly Row[],
  options: { columns?: readonly TableColumn<Row>[]; padding?: number } = {},
): Promise<string> {
  const result = await render(Table, { props: { data, ...options } });
  try {
    return result.lastFrame() ?? "";
  } finally {
    result.unmount();
  }
}

describe("Table", () => {
  test("renders an exact grid from auto-derived columns", async () => {
    await expect(
      renderTable([
        { name: "Alice", age: 30 },
        { name: "Bob", age: 7 },
      ]),
    ).resolves.toBe(
      [
        "┌───────┬─────┐",
        "│ name  │ age │",
        "├───────┼─────┤",
        "│ Alice │ 30  │",
        "├───────┼─────┤",
        "│ Bob   │ 7   │",
        "└───────┴─────┘",
      ].join("\n"),
    );
  });

  test("orders, labels, aligns, and formats explicit columns", async () => {
    type Row = { name: string; duration: number };
    const columns = [
      { key: "name", label: "Task" },
      {
        key: "duration",
        label: "Duration",
        align: "right",
        format: (value, row) => `${row.name}:${value} ms`,
      },
    ] satisfies readonly TableColumn<Row>[];

    await expect(
      renderTable<Row>(
        [
          { name: "build", duration: 12 },
          { name: "test", duration: 3 },
        ],
        { columns },
      ),
    ).resolves.toBe(
      [
        "┌───────┬─────────────┐",
        "│ Task  │    Duration │",
        "├───────┼─────────────┤",
        "│ build │ build:12 ms │",
        "├───────┼─────────────┤",
        "│ test  │   test:3 ms │",
        "└───────┴─────────────┘",
      ].join("\n"),
    );
  });

  test("styles headers and cells through structured Text props", async () => {
    type Row = { status: "ready" | "failed"; attempts: number };
    const columns = [
      {
        key: "status",
        label: "Status",
        headerStyle: { bold: true },
        cellStyle: (value: Row["status"], row: Row) => ({
          color: value === "ready" && row.attempts === 1 ? "green" : "red",
          backgroundColor: value === "ready" ? "blue" : undefined,
        }),
      },
    ] satisfies readonly TableColumn<Row>[];

    const result = await render(Table, {
      props: {
        data: [
          { status: "ready", attempts: 1 },
          { status: "failed", attempts: 2 },
        ] satisfies Row[],
        columns,
      },
      color: "truecolor",
    });
    try {
      expect(result.lastFrame({ raw: true })).toBe(
        [
          `┌────────┐`,
          `│ ${chalk.bold("Status")} │`,
          `├────────┤`,
          `│ ${chalk.bgBlue(chalk.green("ready"))}  │`,
          `├────────┤`,
          `│ ${chalk.red("failed")} │`,
          `└────────┘`,
        ].join("\n"),
      );
    } finally {
      result.unmount();
    }
  });

  test("uses terminal display width for wide characters", async () => {
    const output = await renderTable([{ city: "新加坡", icon: "🙂" }]);
    expect(output).toMatchInlineSnapshot(`
      "┌────────┬──────┐
      │ city   │ icon │
      ├────────┼──────┤
      │ 新加坡 │ 🙂   │
      └────────┴──────┘"
    `);
  });

  test("applies left, center, and right alignment to exact cell spacing", async () => {
    type Row = { left: string; center: string; right: string };
    const columns = [
      { key: "left", label: "HHHH" },
      { key: "center", label: "HHHH", align: "center" },
      { key: "right", label: "HHHH", align: "right" },
    ] satisfies readonly TableColumn<Row>[];

    const output = await renderTable<Row>([{ left: "AB", center: "AB", right: "AB" }], {
      columns,
    });
    expect(output).toMatchInlineSnapshot(`
      "┌──────┬──────┬──────┐
      │ HHHH │ HHHH │ HHHH │
      ├──────┼──────┼──────┤
      │ AB   │  AB  │   AB │
      └──────┴──────┴──────┘"
    `);
  });

  test("applies alignment to every physical line in a multiline cell", async () => {
    type Row = { value: string };
    const columns = [
      { key: "value", label: "Value", align: "right" },
    ] satisfies readonly TableColumn<Row>[];
    const output = await renderTable<Row>([{ value: "A\nLONG" }], { columns });
    expect(output).toMatchInlineSnapshot(`
      "┌───────┐
      │ Value │
      ├───────┤
      │     A │
      │  LONG │
      └───────┘"
    `);
  });

  test("centers every physical line against the complete column width", async () => {
    type Row = { value: string };
    const columns = [
      { key: "value", label: "Value", align: "center" },
    ] satisfies readonly TableColumn<Row>[];
    const output = await renderTable<Row>([{ value: "A\nLONG" }], { columns });
    expect(output).toMatchInlineSnapshot(`
      "┌───────┐
      │ Value │
      ├───────┤
      │   A   │
      │ LONG  │
      └───────┘"
    `);
  });

  test.each([
    [0, "┌─────┐\n│K    │\n├─────┤\n│value│\n└─────┘"],
    [2, "┌─────────┐\n│  K      │\n├─────────┤\n│  value  │\n└─────────┘"],
  ] as const)("renders padding=%i exactly", async (padding, expected) => {
    type Row = { key: string };
    const columns = [{ key: "key", label: "K" }] satisfies readonly TableColumn<Row>[];
    await expect(renderTable<Row>([{ key: "value" }], { columns, padding })).resolves.toBe(
      expected,
    );
  });

  test("renders explicit headers for empty data and nothing when no columns exist", async () => {
    type Row = { name: string };
    const columns = [{ key: "name", label: "Name" }] satisfies readonly TableColumn<Row>[];
    await expect(renderTable<Row>([], { columns })).resolves.toBe("┌──────┐\n│ Name │\n└──────┘");
    await expect(renderTable([])).resolves.toBe("");
  });

  test("does not occupy layout space when it has no rows or columns", async () => {
    const App = defineComponent(() => () => (
      <Box flexDirection="column" gap={1}>
        <Text>before</Text>
        <Table data={[]} />
        <Text>after</Text>
      </Box>
    ));
    const result = await render(App);
    try {
      expect(result.lastFrame()).toBe("before\n\nafter");
    } finally {
      result.unmount();
    }
  });

  test("preserves multiline cells and expands the logical row to its tallest cell", async () => {
    type Row = { name: string; description: string };
    const columns = [{ key: "name" }, { key: "description" }] satisfies readonly TableColumn<Row>[];

    await expect(
      renderTable<Row>([{ name: "build", description: "Compile\r\nthe application" }], {
        columns,
      }),
    ).resolves.toBe(
      [
        "┌───────┬─────────────────┐",
        "│ name  │ description     │",
        "├───────┼─────────────────┤",
        "│ build │ Compile         │",
        "│       │ the application │",
        "└───────┴─────────────────┘",
      ].join("\n"),
    );
  });

  test("leaves nullish cells blank", async () => {
    const output = await renderTable([
      { empty: null, missing: undefined, enabled: false, count: 0 },
    ]);
    expect(output).toMatchInlineSnapshot(`
      "┌───────┬─────────┬─────────┬───────┐
      │ empty │ missing │ enabled │ count │
      ├───────┼─────────┼─────────┼───────┤
      │       │         │ false   │ 0     │
      └───────┴─────────┴─────────┴───────┘"
    `);
  });

  test("preserves line breaks in symbol values", async () => {
    const output = await renderTable([{ symbol: Symbol("first\nsecond") }]);
    expect(output).toMatchInlineSnapshot(`
      "┌──────────────┐
      │ symbol       │
      ├──────────────┤
      │ Symbol(first │
      │ second)      │
      └──────────────┘"
    `);
  });

  test("formats non-scalar cell values with an explicit formatter", async () => {
    type Row = { metadata: { id: number } };
    const columns = [
      { key: "metadata", format: (value) => `id=${value.id}` },
    ] satisfies readonly TableColumn<Row>[];
    const output = await renderTable<Row>([{ metadata: { id: 7 } }], { columns });
    expect(output).toMatchInlineSnapshot(`
      "┌──────────┐
      │ metadata │
      ├──────────┤
      │ id=7     │
      └──────────┘"
    `);
  });

  test("wraps cells inside a narrow parent without breaking the grid", async () => {
    const App = defineComponent(() => () => (
      <Box width={12}>
        <Table data={[{ value: "one two three" }]} />
      </Box>
    ));
    const result = await render(App, { columns: 40, rows: 12 });
    try {
      expect(result.lastFrame()).toBe(
        [
          "┌──────────┐",
          "│ value    │",
          "├──────────┤",
          "│ one two  │",
          "│ three    │",
          "└──────────┘",
        ].join("\n"),
      );
    } finally {
      result.unmount();
    }
  });

  test("keeps shared column boundaries aligned while neighboring cells wrap", async () => {
    const App = defineComponent(() => () => (
      <Box width={24}>
        <Table
          data={[
            { name: "build", description: "Compile the application" },
            { name: "test", description: "Run all tests" },
          ]}
        />
      </Box>
    ));
    const result = await render(App, { columns: 40, rows: 20 });
    try {
      expect(result.lastFrame()).toMatchInlineSnapshot(`
        "┌──────┬───────────────┐
        │ name │ description   │
        ├──────┼───────────────┤
        │ buil │ Compile the   │
        │ d    │ application   │
        ├──────┼───────────────┤
        │ test │ Run all       │
        │      │ tests         │
        └──────┴───────────────┘"
      `);
    } finally {
      result.unmount();
    }
  });

  test("keeps every character when fractional columns reach the minimum width", async () => {
    const App = defineComponent(() => () => (
      <Box width={13}>
        <Table data={[{ a: "ABCDEFGHIJK", b: "xyz" }]} padding={0} />
      </Box>
    ));
    const result = await render(App, { columns: 40, rows: 12 });
    try {
      expect(result.lastFrame()).toMatchInlineSnapshot(`
        "┌───────┬───┐
        │a      │b  │
        ├───────┼───┤
        │ABCDEFG│xy │
        │HIJK   │z  │
        └───────┴───┘"
      `);
    } finally {
      result.unmount();
    }
  });

  test("keeps both columns visible at the default-padding minimum", async () => {
    const App = defineComponent(() => () => (
      <Box width={9}>
        <Table data={[{ a: "ABCDE", b: "xyz" }]} />
      </Box>
    ));
    const result = await render(App, { columns: 40, rows: 12 });
    try {
      expect(result.lastFrame()).toMatchInlineSnapshot(`
        "┌───┬───┐
        │ a │ b │
        ├───┼───┤
        │ A │ x │
        │ B │ y │
        │ C │ z │
        │ D │   │
        │ E │   │
        └───┴───┘"
      `);
    } finally {
      result.unmount();
    }
  });

  test("lets a column truncate instead of increasing the logical row height", async () => {
    type Row = { value: string };
    const columns = [{ key: "value", wrap: "truncate" }] satisfies readonly TableColumn<Row>[];
    const App = defineComponent(() => () => (
      <Box width={12}>
        <Table data={[{ value: "one two three" }]} columns={columns} />
      </Box>
    ));
    const result = await render(App, { columns: 40, rows: 12 });
    try {
      expect(result.lastFrame()).toBe(
        ["┌──────────┐", "│ value    │", "├──────────┤", "│ one two… │", "└──────────┘"].join("\n"),
      );
    } finally {
      result.unmount();
    }
  });

  test("reflows cells when the terminal width changes", async () => {
    const result = await render(Table, {
      props: { data: [{ value: "one two three" }] },
      columns: 20,
      rows: 12,
    });
    try {
      expect(result.lastFrame()).toBe(
        [
          "┌───────────────┐",
          "│ value         │",
          "├───────────────┤",
          "│ one two three │",
          "└───────────────┘",
        ].join("\n"),
      );

      await result.terminal.resize(12, 12);
      expect(result.lastFrame()).toBe(
        [
          "┌──────────┐",
          "│ value    │",
          "├──────────┤",
          "│ one two  │",
          "│ three    │",
          "└──────────┘",
        ].join("\n"),
      );
    } finally {
      result.unmount();
    }
  });

  test("recomputes widths and rows when data changes", async () => {
    const rows = shallowRef([{ name: "A" }]);
    const App = defineComponent(() => () => <Table data={rows.value} />);
    const result = await render(App);
    try {
      expect(result.lastFrame()).toMatchInlineSnapshot(`
        "┌──────┐
        │ name │
        ├──────┤
        │ A    │
        └──────┘"
      `);
      rows.value = [{ name: "longer" }];
      await nextTick();
      await result.waitUntilRenderFlush();
      expect(result.lastFrame()).toMatchInlineSnapshot(`
        "┌────────┐
        │ name   │
        ├────────┤
        │ longer │
        └────────┘"
      `);
    } finally {
      result.unmount();
    }
  });
});
