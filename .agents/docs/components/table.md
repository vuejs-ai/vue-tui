# Table — decision record

> Decisions specific to `@vue-tui/components`' `Table`. Shared conventions live in
> [components-design-principles.md](../components-design-principles.md). Tracking: #224.

`Table` renders tabular data with Unicode box-drawing borders, auto-derived or explicit column
configuration, and three scoped slots for full visual customization.

## Package placement

- `Table` lives in `@vue-tui/components`, not `@vue-tui/runtime`.
- It is a pure composition of runtime primitives: `<Box>`, `<Text>`, and the public `Scalar` /
  `ScalarDict` types.
- It does not import `@vue-tui/runtime/internal`. Cell width measurement uses the external
  `string-width` package (already a runtime dependency) for correct CJK / emoji / multi-byte
  character handling.

## Column configuration

- **Auto-derived (zero-config):** when `columns` is omitted, the component collects the union of
  all keys from `props.data` and uses each key as both the column label and accessor. This makes
  simple datasets render without any column boilerplate.
- **Explicit `ColumnConfig[]`:** each column specifies `label` (header text) and `key` (data
  accessor), plus optional `align`, `formatter`, and `headerColor`.
- **`defineTableColumns(cols)`** is a passthrough identity helper that enables TypeScript
  excess-property checking on column config arrays — catching typos like `align2` at compile time.
  It is the recommended way to define column arrays in consumer code.

## Slot design

Three scoped slots cover every visual element of the table. Each slot receives pre-computed,
already-padded strings — custom renderers do not need to re-implement alignment or layout logic.

| slot       | scope                                                        | covers                                          |
| ---------- | ------------------------------------------------------------ | ----------------------------------------------- |
| `skeleton` | `{ text, kind, part }`                                       | Every border/skeleton character piece by piece. |
| `header`   | `{ text, column, columnIndex, width }`                       | Header cells, one slot invocation per column.   |
| `cell`     | `{ text, value, column, columnIndex, width, row, rowIndex }` | Data cells, one slot invocation per cell.       |

### `skeleton` slot

The `skeleton` slot is the escape hatch for border styling. Rather than a single "border renderer"
that must reproduce the entire table frame, each individual character is rendered through its own
slot invocation tagged with `kind` ("top" | "header" | "separator" | "data" | "bottom") and `part`
("left" | "line" | "cross" | "right"). This lets the consumer change border style piecemeal (e.g.
double-line separators, ASCII fallback, custom colors) without replacing the whole border.

The default rendering uses the Unicode box-drawing set: `┌─┬┐├┼┤└┴┘│`.

### `header` slot

Receives the already-padded, already-formatted header text plus the source `ColumnConfig`. The
default rendering applies bold + blue (or the column's `headerColor`). Using this slot disables
both the default bold-blue style and the `headerColor` prop for that column.

### `cell` slot

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
- Applies to both plain headers (bold + color) and formatter-produced headers (color only, no bold
  — the formatter owns the text content).

## Null / undefined handling

Cells with `null` or `undefined` values render as blank (whitespace only). They are never rendered
as the string `"null"` or `"undefined"`. This matches the expectation that missing data should be
visually empty, not display a type name.

## Non-goals

- **Sorting, filtering, row selection** — interactive table features are deferred to future work.
  Table is a data-display component; interactivity belongs in a separate issue.
- **Column resizing** — column widths are computed from content, not user-adjustable.
- **Multi-line cells** — each row is exactly one terminal line tall. Content that exceeds the
  column width is not wrapped or truncated by default (the consumer can handle this in the `cell`
  slot).
