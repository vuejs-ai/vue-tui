# Table — decision record

> Decisions specific to `@vue-tui/components`' `Table`. Shared conventions live in
> [components-design-principles.md](../components-design-principles.md). Tracking: #224.

`Table` renders tabular data with Unicode box-drawing borders, auto-derived or explicit column
configuration, and two scoped slots for cell customization. It is generic over the row type `T`,
inferred from the `data` prop — slot props (`row`, `value`, `column`) are typed accordingly.

## Package placement

- `Table` lives in `@vue-tui/components`, not `@vue-tui/runtime`.
- It is a pure composition of runtime primitives: `<Box>`, `<Text>`, and the internal `Scalar` /
  `ScalarDict` types (these are local to `table-props.ts` and not exported from the package).
- It does not import `@vue-tui/runtime/internal`. Cell width measurement uses the external
  `string-width` package (already a runtime dependency) for correct CJK / emoji / multi-byte
  character handling.

## Generic row type

`Table` is generic over the row type `T` (defaults to `ScalarDict`). The generic is inferred
from the `data` prop and flows into scoped slots (`row`, `value`, `column`) and the `columns`
prop.

`ColumnConfig` itself is intentionally non-generic (`key: string`) to avoid TypeScript
invariance from `keyof T`. The row-type-specific key narrowing is applied via the intersection
type `ColumnConfigTyped<T> = ColumnConfig & { key: keyof T & string }`, used in `TableProps<T>`
and `defineTableColumns<T>`.

The SFC itself uses plain `<script setup lang="ts">` (no `generic` attribute) — generic
inference is provided entirely at the export site via `as unknown as`, following the same
pattern as `<Static>` in `@vue-tui/runtime`:

- `table-props.ts` exports `TableProps<T>` and `defineTableColumns<T>` (both generic),
  plus internal types `ColumnConfig`, `ColumnConfigBase`, `ColumnConfigTyped<T>`,
  `TableDefaultSlotProps<T>`, and `TableHeaderSlotProps<T>`.
- `index.ts` imports the SFC and casts it: `TableSfc as unknown as { new <T>(): { … } }`.
  The cast **replaces** the SFC's type rather than intersecting it, because a `.vue` with
  scoped slots emits a `__VLS_WithSlots` construct signature with non-generic slot types
  that would block `T` inference.
- Only `Table`, `TableProps`, and `defineTableColumns` are re-exported from the package
  barrel — the remaining types flow implicitly through generics.

Consumer code benefits without any extra annotation:

```tsx
const data = [{ name: "Alice", age: 30 }];
<Table data={data}>
  {{
    default: ({ row, value }) => {
      // row: { name: string; age: number }
      // value: string | number
    },
  }}
</Table>;
```

## Column configuration

- **Auto-derived (zero-config):** when `columns` is omitted, the component collects the union of
  all keys from `props.data` and uses each key as both the column label and accessor. This makes
  simple datasets render without any column boilerplate.
- **Explicit `ColumnConfig[]`:** each column specifies `label` (header text) and `key` (data
  accessor), plus optional `align`, `headerFormatter`, and `headerColor`.
- **`defineTableColumns(cols)`** is a passthrough identity helper that enables TypeScript
  excess-property checking on column config arrays — catching typos like `align2` at compile time.
  It is generic over the row type `T` so keys are constrained to actual data keys. It is the
  recommended way to define column arrays in consumer code.

## Slot design

Two scoped slots cover cell rendering. Border characters are always rendered directly
(not customizable via slots). Each slot receives pre-computed, already-padded strings —
custom renderers do not need to re-implement alignment or layout logic.

| slot      | scope                                                        | covers                                        |
| --------- | ------------------------------------------------------------ | --------------------------------------------- |
| `header`  | `{ text, column, columnIndex, width }`                       | Header cells, one slot invocation per column. |
| _default_ | `{ text, value, column, columnIndex, width, row, rowIndex }` | Data cells, one slot invocation per cell.     |

### `header` slot

Receives the already-padded, already-formatted header text plus the source `ColumnConfig`. The
default rendering applies bold + blue (or the column's `headerColor`). Using this slot disables
both the default bold-blue style and the `headerColor` prop for that column.

### Default slot

Receives the already-padded cell text, the raw `value`, the `ColumnConfig`, and the full `row`
object with its `rowIndex`. The default rendering is plain `<Text>`. Common customizations:
value-specific coloring (e.g. red for negative numbers), truncation with ellipsis, or interactive
elements.

## Width calculation & alignment

- Column widths are computed as `max(headerWidth, ...dataWidths) + padding * 2`, where widths are
  measured with `string-width`.
- `padding` (default `1`) adds that many spaces on each side of every cell.
- Alignment (`left` | `center` | `right`, default `left`) controls how the text is positioned
  within the padded cell width. Padding spaces are always outside the alignment region — `left`
  pads the right side, `right` pads the left side, `center` splits evenly.

## `headerColor`

- Each column can specify a `headerColor` (string, any terminal-supported color name). Defaults to
  `"blue"` when omitted.
- Has no effect when the `header` slot is used — the slot fully owns header rendering.
- Applies to both plain headers (bold + color) and headerFormatter-produced headers (color only,
  no bold — the headerFormatter owns the text content).

## Null / undefined handling

Cells with `null` or `undefined` values render as blank (whitespace only). They are never rendered
as the string `"null"` or `"undefined"`. This matches the expectation that missing data should be
visually empty, not display a type name.

## Non-goals

- **Sorting, filtering, row selection** — interactive table features are deferred to future work.
  Table is a data-display component; interactivity belongs in a separate issue.
- **Column resizing** — column widths are computed from content, not user-adjustable.
- **Multi-line cells** — each row is exactly one terminal line tall. Newline characters in cell
  values are stripped before rendering to prevent broken table layout. Content that exceeds the
  column width is not wrapped or truncated by default.
